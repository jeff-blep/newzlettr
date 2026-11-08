import { Router } from "express";
import { z } from "zod";
import type { HostPick, MediaRef, WatchUser } from "../../../shared/types.js";
import type { DB } from "../db/index.js";
import { getStats } from "../data/stats.js";
import type { PlexItem } from "../integrations/plex.js";
import { logger } from "../logging.js";
import { plexClient, tautulliClient } from "../services.js";
import { DEFAULT_HISTORY_DAYS } from "../settings.js";

/** Plex metadata -> card-friendly ref. Episodes show "Show — S1E2 · Title". */
export function plexItemToRef(m: PlexItem): MediaRef {
  const ep = m.type === "episode";
  return {
    ratingKey: m.ratingKey,
    title: ep ? (m.grandparentTitle ?? m.title) : m.title,
    subtitle: ep
      ? `S${m.parentIndex ?? "?"}E${m.index ?? "?"} · ${m.title}`
      : m.type === "season"
        ? `${m.parentTitle ?? ""} ${m.title}`.trim()
        : undefined,
    year: m.year,
    thumb: ep ? (m.grandparentThumb ?? m.thumb) : m.thumb,
    summary: m.summary,
    type: m.type,
    addedAt: m.addedAt,
  };
}

/** Only real Plex library image paths may be proxied (v1 proxied arbitrary URLs = SSRF). */
const IMAGE_PATH = /^\/library\/metadata\/\d+\/(thumb|art|grandparentThumb|parentThumb)(\/\d+)?$/;

export function mediaRouter(db: DB): Router {
  const r = Router();
  const log = logger("media");

  /* --------------------------------- plex --------------------------------- */

  r.get("/plex/search", async (req, res) => {
    const q = String(req.query.q ?? "").trim();
    if (q.length < 2) return res.json([]);
    const items = await plexClient(db).search(q, 10);
    const rank: Record<string, number> = { movie: 0, show: 0, episode: 1 };
    res.json(
      items
        .filter((m) => m.type in rank)
        .sort((a, b) => rank[a.type]! - rank[b.type]!)
        .slice(0, 15)
        .map(plexItemToRef),
    );
  });

  r.get("/plex/image", async (req, res) => {
    const path = String(req.query.path ?? "");
    if (!IMAGE_PATH.test(path)) return res.status(400).json({ error: "invalid image path" });
    const w = Math.min(600, Math.max(40, Number(req.query.w) || 200));
    const h = Math.min(900, Math.max(60, Number(req.query.h) || Math.round(w * 1.5)));
    try {
      const img = await plexClient(db).image(path, w, h);
      res.setHeader("Content-Type", img.contentType);
      res.setHeader("Cache-Control", "private, max-age=86400");
      res.end(img.bytes);
    } catch (e) {
      log.debug({ err: e, path }, "image proxy failed");
      res.status(502).json({ error: "image unavailable" });
    }
  });

  /* ------------------------------- host pick ------------------------------ */

  const readPick = async (): Promise<HostPick> => {
    const row = db.prepare("SELECT plex_item_id, note, updated_at FROM host_pick WHERE id = 1").get() as
      | { plex_item_id: string | null; note: string; updated_at: string }
      | undefined;
    const pick: HostPick = { plexItemId: row?.plex_item_id ?? null, note: row?.note ?? "", updatedAt: row?.updated_at ?? null, item: null };
    if (pick.plexItemId) {
      try {
        const m = await plexClient(db).metadata(pick.plexItemId);
        if (m) pick.item = plexItemToRef(m);
        else pick.itemError = "That title is no longer in your Plex library.";
      } catch (e) {
        pick.itemError = `Couldn't load it from Plex: ${(e as Error).message}`;
      }
    }
    return pick;
  };

  r.get("/host-pick", async (_req, res) => res.json(await readPick()));

  r.put("/host-pick", async (req, res) => {
    const p = z
      .object({ plexItemId: z.string().trim().regex(/^\d+$/, "invalid Plex item").nullable(), note: z.string().max(4000) })
      .safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message });
    db.prepare(
      `INSERT INTO host_pick(id, plex_item_id, note) VALUES(1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET plex_item_id = excluded.plex_item_id, note = excluded.note,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
    ).run(p.data.plexItemId, p.data.note);
    log.info({ plexItemId: p.data.plexItemId }, "host pick saved");
    res.json(await readPick());
  });

  /** Plex users as Tautulli knows them (for "leave out of watch stats"). Names only - no emails. */
  r.get("/watch-users", async (_req, res) => {
    const users = await tautulliClient(db).users();
    const out: WatchUser[] = users
      .filter((u) => Number(u.user_id) > 0)
      .map((u) => ({ userId: Number(u.user_id), name: u.friendly_name || u.username || `User ${u.user_id}`, isOwner: !!u.is_admin }))
      .sort((a, b) => Number(b.isOwner) - Number(a.isOwner) || a.name.localeCompare(b.name));
    res.json(out);
  });

  /* --------------------------------- stats -------------------------------- */

  r.get("/stats", async (req, res) => {
    const days = Number(req.query.days) || DEFAULT_HISTORY_DAYS;
    if (days < 1 || days > 365) return res.status(400).json({ error: "days must be 1-365" });
    res.json(await getStats(db, days, { fresh: req.query.fresh === "1" }));
  });

  return r;
}
