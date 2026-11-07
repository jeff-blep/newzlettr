import { Router } from "express";
import { z } from "zod";
import type { IgnoredPerson, PlexAccessStatus, Recipient, RecipientImportResult } from "../../../shared/types.js";
import type { DB } from "../db/index.js";
import { tx } from "../db/index.js";
import { logger } from "../logging.js";
import { applyShares, fetchShares, syncPlexAccess } from "../data/plexAccess.js";
import type { PlexSharedUser } from "../integrations/plex.js";

const EMAIL = z.string().trim().toLowerCase().email("Enter a valid email address");
const body = z.object({ name: z.string().trim().max(120).default(""), email: EMAIL });
const IDS = z.array(z.number().int().positive()).min(1).max(10_000);

interface Row {
  id: number;
  name: string;
  email: string;
  source: Recipient["source"];
  created_at: string;
  newsletter_count: number;
  plex_user_id: string | null;
  plex_status: PlexAccessStatus | null;
  plex_libraries: string;
  plex_checked_at: string | null;
  list_ids: string | null;
}

const toRecipient = (r: Row): Recipient => ({
  id: r.id,
  name: r.name,
  email: r.email,
  source: r.source,
  createdAt: r.created_at,
  newsletterCount: r.newsletter_count,
  listIds: r.list_ids ? r.list_ids.split(",").map(Number) : [],
  plexAccess:
    r.plex_status && r.plex_checked_at
      ? { status: r.plex_status, libraries: safeList(r.plex_libraries), checkedAt: r.plex_checked_at }
      : null,
});

function safeList(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

const SELECT = `SELECT r.*,
                  (SELECT COUNT(*) FROM newsletter_recipients nr WHERE nr.recipient_id = r.id) AS newsletter_count,
                  (SELECT group_concat(list_id) FROM recipient_list_members m WHERE m.recipient_id = r.id) AS list_ids
                FROM recipients r`;

export function listRecipients(db: DB): Recipient[] {
  return (db.prepare(`${SELECT} ORDER BY lower(CASE WHEN r.name = '' THEN r.email ELSE r.name END)`).all() as unknown as Row[]).map(toRecipient);
}

/**
 * Deletes recipients; with `ignore`, first records them on the Ignore list so Import from Plex
 * won't bring them back (Sonarr's "add list exclusion"). Returns how many were deleted.
 */
export function deleteRecipients(db: DB, ids: number[], ignore: boolean): number {
  return tx(db, () => {
    const get = db.prepare("SELECT id, name, email, plex_user_id FROM recipients WHERE id = ?");
    const exclude = db.prepare(
      `INSERT INTO import_exclusions(plex_user_id, email, name) VALUES(?, ?, ?)
       ON CONFLICT DO NOTHING`,
    );
    const del = db.prepare("DELETE FROM recipients WHERE id = ?");
    let n = 0;
    for (const id of new Set(ids)) {
      const row = get.get(id) as { name: string; email: string; plex_user_id: string | null } | undefined;
      if (!row) continue;
      if (ignore) exclude.run(row.plex_user_id, row.email, row.name);
      n += Number(del.run(id).changes);
    }
    return n;
  });
}

/** Adds new people from Plex shares (skipping pending invites, no-email users and the Ignore list). */
export function mergeShares(db: DB, shares: PlexSharedUser[]): Omit<RecipientImportResult, "access"> {
  const result: Omit<RecipientImportResult, "access"> = {
    found: shares.length,
    added: 0,
    updated: 0,
    skippedNoEmail: 0,
    skippedPending: 0,
    skippedIgnored: 0,
    alreadyPresent: 0,
  };
  tx(db, () => {
    const find = db.prepare("SELECT id, name FROM recipients WHERE email = ?");
    const ignored = db.prepare("SELECT 1 FROM import_exclusions WHERE (plex_user_id IS NOT NULL AND plex_user_id = ?) OR email = ?");
    const add = db.prepare("INSERT INTO recipients(name, email, source, plex_user_id) VALUES(?, ?, 'plex', ?)");
    const fillName = db.prepare("UPDATE recipients SET name = ? WHERE id = ?");
    for (const u of shares) {
      if (u.pending) {
        result.skippedPending++;
        continue;
      }
      if (!z.string().email().safeParse(u.email).success) {
        result.skippedNoEmail++;
        continue;
      }
      const name = (u.title || u.username || "").trim();
      const existing = find.get(u.email) as { id: number; name: string } | undefined;
      if (existing) {
        if (!existing.name && name) {
          fillName.run(name, existing.id);
          result.updated++;
        } else result.alreadyPresent++;
        continue;
      }
      if (ignored.get(u.userId || null, u.email)) {
        result.skippedIgnored++;
        continue;
      }
      add.run(name, u.email, u.userId || null);
      result.added++;
    }
  });
  return result;
}

export function recipientsRouter(db: DB): Router {
  const r = Router();
  const log = logger("recipients");
  const one = (id: number) => {
    const row = db.prepare(`${SELECT} WHERE r.id = ?`).get(id) as Row | undefined;
    return row ? toRecipient(row) : null;
  };

  r.get("/", (_req, res) => res.json(listRecipients(db)));

  r.post("/", (req, res) => {
    const p = body.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message });
    try {
      const out = db.prepare("INSERT INTO recipients(name, email, source) VALUES(?, ?, 'manual') RETURNING id").get(p.data.name, p.data.email) as { id: number };
      // Adding someone by hand is a deliberate choice: lift any ignore on that address.
      db.prepare("DELETE FROM import_exclusions WHERE email = ?").run(p.data.email);
      log.info({ id: out.id }, "recipient added");
      res.status(201).json(one(out.id));
    } catch (e) {
      if (/UNIQUE/.test((e as Error).message)) return res.status(409).json({ error: `${p.data.email} is already a recipient` });
      throw e;
    }
  });

  r.put("/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!one(id)) return res.status(404).json({ error: "not found" });
    const p = body.partial().safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message });
    const sent = new Set(Object.keys(req.body ?? {}));
    try {
      if (sent.has("name")) db.prepare("UPDATE recipients SET name = ? WHERE id = ?").run(p.data.name ?? "", id);
      if (sent.has("email") && p.data.email) db.prepare("UPDATE recipients SET email = ? WHERE id = ?").run(p.data.email, id);
    } catch (e) {
      if (/UNIQUE/.test((e as Error).message)) return res.status(409).json({ error: `${p.data.email} is already a recipient` });
      throw e;
    }
    res.json(one(id));
  });

  /** Delete many at once, optionally adding them to the Ignore list. */
  r.post("/bulk-delete", (req, res) => {
    const p = z.object({ ids: IDS, ignore: z.boolean().default(false) }).safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message ?? "invalid" });
    const deleted = deleteRecipients(db, p.data.ids, p.data.ignore);
    log.info({ requested: p.data.ids.length, deleted, ignore: p.data.ignore }, "bulk recipient delete");
    res.json({ deleted, ignored: p.data.ignore ? deleted : 0 });
  });

  r.delete("/:id", (req, res) => {
    const ignore = req.query.ignore === "1" || req.query.ignore === "true";
    const n = deleteRecipients(db, [Number(req.params.id)], ignore);
    if (!n) return res.status(404).json({ error: "not found" });
    log.info({ id: req.params.id, ignore }, "recipient deleted");
    res.status(204).end();
  });

  /* ------------------------------ ignore list ------------------------------ */

  r.get("/ignored", (_req, res) => {
    const rows = db.prepare("SELECT * FROM import_exclusions ORDER BY lower(CASE WHEN name = '' THEN coalesce(email, '') ELSE name END)").all() as {
      id: number;
      plex_user_id: string | null;
      email: string | null;
      name: string;
      created_at: string;
    }[];
    res.json(rows.map((x): IgnoredPerson => ({ id: x.id, name: x.name, email: x.email, plexUserId: x.plex_user_id, ignoredAt: x.created_at })));
  });

  /** Take people off the Ignore list. They come back on the next Import from Plex. */
  r.post("/ignored/remove", (req, res) => {
    const p = z.object({ ids: IDS }).safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message ?? "invalid" });
    const removed = tx(db, () => {
      const del = db.prepare("DELETE FROM import_exclusions WHERE id = ?");
      let n = 0;
      for (const id of new Set(p.data.ids)) n += Number(del.run(id).changes);
      return n;
    });
    log.info({ removed }, "removed from ignore list");
    res.json({ removed });
  });

  /* ------------------------------ plex import ------------------------------ */

  /** Merge the people this Plex server is shared with, by email. Skips the Ignore list; never removes anyone. */
  r.post("/import/plex", async (_req, res) => {
    const shares = await fetchShares(db);
    const result = mergeShares(db, shares);
    const a = applyShares(db, shares);
    log.info(result, "imported recipients from Plex");
    res.json({ ...result, access: { libraries: a.libraries, noLibraries: a.noLibraries, invited: a.invited, noAccess: a.noAccess } } satisfies RecipientImportResult);
  });

  /** Re-check everyone's Plex access without adding anyone. */
  r.post("/sync/plex", async (_req, res) => res.json(await syncPlexAccess(db)));

  return r;
}
