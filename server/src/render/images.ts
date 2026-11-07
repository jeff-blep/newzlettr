import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { DB } from "../db/index.js";
import { uploadImage } from "../integrations/cloudinary.js";
import { logger } from "../logging.js";
import { ASSETS_DIR } from "../paths.js";
import { plexClient } from "../services.js";
import { getSection } from "../settings.js";

const log = logger("images");
const IMG_TAG = /<img\b[^>]*\bsrc="(nzimg:\/\/[^"]+)"[^>]*>/g;

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
  cid: string;
}

interface Source {
  kind: "plex" | "asset";
  path: string;
  w: number;
  h: number;
}

function parse(url: string): Source | null {
  const decoded = url.replace(/&amp;/g, "&");
  if (decoded.startsWith("nzimg://asset/")) {
    const file = decoded.slice("nzimg://asset/".length);
    // assets are fixed files - refuse traversal
    if (!/^[a-z0-9_\-/]+\.(png|jpg|jpeg|gif|svg)$/i.test(file) || file.includes("..")) return null;
    return { kind: "asset", path: file, w: 0, h: 0 };
  }
  if (decoded.startsWith("nzimg://plex?")) {
    const q = new URLSearchParams(decoded.slice("nzimg://plex?".length));
    const p = q.get("path");
    if (!p || !p.startsWith("/")) return null;
    return { kind: "plex", path: p, w: Number(q.get("w")) || 300, h: Number(q.get("h")) || 450 };
  }
  return null;
}

/** In-app preview: point placeholders at the authenticated proxy / static assets. */
export function resolveForPreview(html: string): string {
  return html.replace(/nzimg:\/\/[^"]+/g, (url) => {
    const s = parse(url);
    if (!s) return "";
    return s.kind === "asset"
      ? `/email-assets/${s.path}`
      : `/api/plex/image?path=${encodeURIComponent(s.path)}&amp;w=${Math.min(600, s.w)}&amp;h=${Math.min(900, s.h)}`;
  });
}

async function fetchBytes(db: DB, s: Source): Promise<{ bytes: Buffer; contentType: string }> {
  if (s.kind === "asset") {
    const bytes = await fs.readFile(path.join(ASSETS_DIR, s.path));
    return { bytes, contentType: s.path.endsWith(".png") ? "image/png" : "image/jpeg" };
  }
  return plexClient(db).image(s.path, s.w, s.h);
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]!);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Email mode: embed each image as an inline attachment (cid:) or upload it to Cloudinary,
 * per Settings > Images. Images that can't be fetched become a neutral placeholder box.
 */
export async function resolveForEmail(db: DB, html: string): Promise<{ html: string; attachments: MailAttachment[]; warnings: string[] }> {
  const cfg = getSection(db, "images");
  const urls = [...new Set([...html.matchAll(IMG_TAG)].map((m) => m[1]!))];
  const warnings: string[] = [];
  const attachments: MailAttachment[] = [];
  const replacement = new Map<string, string | null>();
  const byHash = new Map<string, string>();
  let failed = 0;

  await mapLimit(urls, 6, async (url) => {
    const s = parse(url);
    if (!s) return void replacement.set(url, null);
    try {
      const { bytes, contentType } = await fetchBytes(db, s);
      const hash = crypto.createHash("sha256").update(bytes).digest("hex");
      if (cfg.mode === "cloudinary") {
        const cached = db.prepare("SELECT url FROM image_cache WHERE content_hash = ?").get(hash) as { url: string } | undefined;
        let hosted = cached?.url;
        if (!hosted) {
          hosted = await uploadImage(cfg, bytes, contentType, hash);
          db.prepare("INSERT OR REPLACE INTO image_cache(content_hash, url) VALUES(?, ?)").run(hash, hosted);
        }
        replacement.set(url, hosted);
      } else {
        let cid = byHash.get(hash);
        if (!cid) {
          cid = `${hash.slice(0, 20)}@newzlettr`;
          byHash.set(hash, cid);
          const ext = contentType.includes("png") ? "png" : "jpg";
          attachments.push({ filename: `${hash.slice(0, 12)}.${ext}`, content: bytes, contentType, cid });
        }
        replacement.set(url, `cid:${cid}`);
      }
    } catch (e) {
      failed++;
      log.debug({ err: e, url }, "image failed");
      replacement.set(url, null);
    }
  });
  if (failed) warnings.push(`${failed} image${failed === 1 ? "" : "s"} couldn't be loaded and were left out.`);

  const out = html.replace(IMG_TAG, (tag, url: string) => {
    const r = replacement.get(url);
    if (r) return tag.replace(url, r);
    const w = /width="(\d+)"/.exec(tag)?.[1] ?? "100";
    const h = /height="(\d+)"/.exec(tag)?.[1] ?? "150";
    return `<div style="width:${w}px;height:${h}px;border-radius:6px;background:#2f3036"></div>`;
  });
  return { html: out, attachments, warnings };
}
