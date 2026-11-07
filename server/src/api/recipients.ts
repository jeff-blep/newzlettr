import { Router } from "express";
import { z } from "zod";
import type { PlexAccessStatus, Recipient, RecipientImportResult } from "../../../shared/types.js";
import type { DB } from "../db/index.js";
import { tx } from "../db/index.js";
import { logger } from "../logging.js";
import { applyShares, fetchShares, syncPlexAccess } from "../data/plexAccess.js";

const EMAIL = z.string().trim().toLowerCase().email("Enter a valid email address");
const body = z.object({ name: z.string().trim().max(120).default(""), email: EMAIL, enabled: z.boolean().default(true) });

interface Row {
  id: number;
  name: string;
  email: string;
  enabled: number;
  source: Recipient["source"];
  created_at: string;
  newsletter_count: number;
  plex_status: PlexAccessStatus | null;
  plex_libraries: string;
  plex_checked_at: string | null;
}

const toRecipient = (r: Row): Recipient => ({
  id: r.id,
  name: r.name,
  email: r.email,
  enabled: !!r.enabled,
  source: r.source,
  createdAt: r.created_at,
  newsletterCount: r.newsletter_count,
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

const SELECT = `SELECT r.*, (SELECT COUNT(*) FROM newsletter_recipients nr WHERE nr.recipient_id = r.id) AS newsletter_count
                FROM recipients r`;

export function listRecipients(db: DB): Recipient[] {
  return (db.prepare(`${SELECT} ORDER BY lower(CASE WHEN r.name = '' THEN r.email ELSE r.name END)`).all() as unknown as Row[]).map(toRecipient);
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
      const out = db
        .prepare("INSERT INTO recipients(name, email, enabled, source) VALUES(?, ?, ?, 'manual') RETURNING id")
        .get(p.data.name, p.data.email, p.data.enabled ? 1 : 0) as { id: number };
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
      if (sent.has("enabled")) db.prepare("UPDATE recipients SET enabled = ? WHERE id = ?").run(p.data.enabled ? 1 : 0, id);
    } catch (e) {
      if (/UNIQUE/.test((e as Error).message)) return res.status(409).json({ error: `${p.data.email} is already a recipient` });
      throw e;
    }
    res.json(one(id));
  });

  /** Enable / disable / delete many recipients at once (all-or-nothing). */
  r.post("/bulk", (req, res) => {
    const p = z
      .object({ action: z.enum(["enable", "disable", "delete"]), ids: z.array(z.number().int().positive()).min(1).max(10_000) })
      .safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message ?? "invalid" });
    const { action, ids } = p.data;
    const changed = tx(db, () => {
      const stmt =
        action === "delete"
          ? db.prepare("DELETE FROM recipients WHERE id = ?")
          : db.prepare("UPDATE recipients SET enabled = ? WHERE id = ?");
      let n = 0;
      for (const id of new Set(ids)) n += Number((action === "delete" ? stmt.run(id) : stmt.run(action === "enable" ? 1 : 0, id)).changes);
      return n;
    });
    log.info({ action, requested: ids.length, changed }, "bulk recipient change");
    res.json({ action, changed });
  });

  r.delete("/:id", (req, res) => {
    const changes = Number(db.prepare("DELETE FROM recipients WHERE id = ?").run(Number(req.params.id)).changes);
    if (!changes) return res.status(404).json({ error: "not found" });
    log.info({ id: req.params.id }, "recipient deleted");
    res.status(204).end();
  });

  /** Merge the people this Plex server is shared with, by email. Never removes anyone. New people start DISABLED. */
  r.post("/import/plex", async (_req, res) => {
    const shares = await fetchShares(db);
    const result: Omit<RecipientImportResult, "access"> = { found: shares.length, added: 0, updated: 0, skippedNoEmail: 0, skippedPending: 0, alreadyPresent: 0 };
    tx(db, () => {
      const find = db.prepare("SELECT id, name FROM recipients WHERE email = ?");
      const add = db.prepare("INSERT INTO recipients(name, email, enabled, source) VALUES(?, ?, 0, 'plex')");
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
        if (!existing) {
          add.run(name, u.email);
          result.added++;
        } else if (!existing.name && name) {
          fillName.run(name, existing.id);
          result.updated++;
        } else result.alreadyPresent++;
      }
    });
    const a = applyShares(db, shares);
    log.info(result, "imported recipients from Plex");
    res.json({ ...result, access: { libraries: a.libraries, noLibraries: a.noLibraries, invited: a.invited, noAccess: a.noAccess } } satisfies RecipientImportResult);
  });

  /** Re-check everyone's Plex access without adding anyone. */
  r.post("/sync/plex", async (_req, res) => res.json(await syncPlexAccess(db)));

  return r;
}
