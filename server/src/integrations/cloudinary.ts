import crypto from "node:crypto";
import { FormData } from "undici";
import type { Section } from "../settings.js";
import { HttpError, httpFetch, httpJson } from "./http.js";

export type ImagesConfig = Section<"images">;

export function cloudinaryConfigured(cfg: ImagesConfig): boolean {
  return !!cfg.cloudName && !!cfg.apiKey && !!cfg.apiSecret;
}

const api = (cfg: ImagesConfig, path: string) => `https://api.cloudinary.com/v1_1/${encodeURIComponent(cfg.cloudName)}${path}`;
const basic = (cfg: ImagesConfig) => `Basic ${Buffer.from(`${cfg.apiKey}:${cfg.apiSecret}`).toString("base64")}`;

export async function pingCloudinary(cfg: ImagesConfig): Promise<{ ok: boolean; message: string }> {
  if (!cloudinaryConfigured(cfg)) return { ok: false, message: "Enter the cloud name, API key and API secret." };
  try {
    await httpJson(api(cfg, "/ping"), { headers: { Authorization: basic(cfg) }, timeoutMs: 10_000 });
    return { ok: true, message: `Connected to Cloudinary cloud "${cfg.cloudName}".` };
  } catch (e) {
    const status = (e as HttpError).status;
    if (status === 401) return { ok: false, message: "Cloudinary rejected the API key/secret." };
    if (status === 404) return { ok: false, message: `No Cloudinary cloud named "${cfg.cloudName}".` };
    return { ok: false, message: (e as Error).message };
  }
}

/** Signed upload. public_id = content hash, so the same image is stored once. Returns the HTTPS URL. */
export async function uploadImage(cfg: ImagesConfig, bytes: Buffer, contentType: string, hash: string): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const params: Record<string, string> = {
    folder: cfg.folder,
    overwrite: "false",
    public_id: hash.slice(0, 32),
    timestamp: String(timestamp),
  };
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  const signature = crypto.createHash("sha1").update(toSign + cfg.apiSecret).digest("hex");
  const form = new FormData();
  form.set("file", `data:${contentType};base64,${bytes.toString("base64")}`);
  form.set("api_key", cfg.apiKey);
  form.set("signature", signature);
  for (const [k, v] of Object.entries(params)) form.set(k, v);
  const res = await httpFetch(api(cfg, "/image/upload"), { method: "POST", body: form, timeoutMs: 30_000 });
  const body = (await res.json()) as { secure_url?: string; error?: { message?: string } };
  if (!res.ok || !body.secure_url) throw new HttpError(`Cloudinary upload failed: ${body.error?.message ?? res.status}`, res.status);
  return body.secure_url;
}

/** Deletes everything Newzlettr uploaded (the configured folder). */
export async function clearFolder(cfg: ImagesConfig): Promise<number> {
  let deleted = 0;
  for (let i = 0; i < 20; i++) {
    const qs = new URLSearchParams({ prefix: `${cfg.folder}/`, all: "false" });
    const res = await httpFetch(api(cfg, `/resources/image/upload?${qs}`), {
      method: "DELETE",
      headers: { Authorization: basic(cfg) },
      timeoutMs: 30_000,
    });
    const body = (await res.json()) as { deleted?: Record<string, string>; partial?: boolean; error?: { message?: string } };
    if (!res.ok) throw new HttpError(`Cloudinary: ${body.error?.message ?? res.status}`, res.status);
    deleted += Object.keys(body.deleted ?? {}).length;
    if (!body.partial) break;
  }
  return deleted;
}

export interface CloudinaryUsage {
  plan: string;
  lastUpdated: string | null;
  /** Free/credit plans: monthly credits (1 credit ~ 1 GB storage, 1 GB bandwidth, or 1,000 transformations). */
  credits: { usage: number; limit: number; usedPercent: number } | null;
  storageBytes: number;
  bandwidthBytes: number;
  transformations: number;
  totalImages: number;
  folder: { name: string; images: number; bytes: number; truncated: boolean };
}

const usageCache = new Map<string, { at: number; value: CloudinaryUsage }>();
const USAGE_TTL = 10 * 60_000;

/** Account usage + what's in Newzlettr's folder. Cached 10 min (the Admin API is rate-limited). */
export async function cloudinaryUsage(cfg: ImagesConfig, fresh = false): Promise<CloudinaryUsage> {
  const key = `${cfg.cloudName}:${cfg.apiKey}:${cfg.folder}`;
  const hit = usageCache.get(key);
  if (!fresh && hit && Date.now() - hit.at < USAGE_TTL) return hit.value;

  const headers = { Authorization: basic(cfg) };
  type Usage = {
    plan?: string;
    last_updated?: string;
    credits?: { usage?: number; limit?: number; used_percent?: number };
    storage?: { usage?: number };
    bandwidth?: { usage?: number };
    transformations?: { usage?: number };
    resources?: number;
  };
  const u = await httpJson<Usage>(api(cfg, "/usage"), { headers, timeoutMs: 15_000 });

  // Sum Newzlettr's own folder (paged; stop after 10 pages = 5,000 images).
  let images = 0;
  let bytes = 0;
  let cursor: string | undefined;
  let pages = 0;
  do {
    const qs = new URLSearchParams({ prefix: `${cfg.folder}/`, max_results: "500", ...(cursor ? { next_cursor: cursor } : {}) });
    const page = await httpJson<{ resources?: { bytes?: number }[]; next_cursor?: string }>(api(cfg, `/resources/image/upload?${qs}`), { headers, timeoutMs: 20_000 });
    for (const r of page.resources ?? []) {
      images++;
      bytes += r.bytes ?? 0;
    }
    cursor = page.next_cursor;
    pages++;
  } while (cursor && pages < 10);

  const value: CloudinaryUsage = {
    plan: u.plan ?? "Unknown",
    lastUpdated: u.last_updated ?? null,
    credits:
      u.credits && typeof u.credits.limit === "number" && u.credits.limit > 0
        ? { usage: u.credits.usage ?? 0, limit: u.credits.limit, usedPercent: u.credits.used_percent ?? ((u.credits.usage ?? 0) / u.credits.limit) * 100 }
        : null,
    storageBytes: u.storage?.usage ?? 0,
    bandwidthBytes: u.bandwidth?.usage ?? 0,
    transformations: u.transformations?.usage ?? 0,
    totalImages: u.resources ?? 0,
    folder: { name: cfg.folder, images, bytes, truncated: !!cursor },
  };
  usageCache.set(key, { at: Date.now(), value });
  return value;
}

export function clearUsageCache(): void {
  usageCache.clear();
}
