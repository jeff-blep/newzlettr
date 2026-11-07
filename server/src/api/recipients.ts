import { Router } from "express";
import { z } from "zod";
import type { Recipient, RecipientImportResult } from "../../../shared/types.js";
import type { DB } from "../db/index.js";
import { tx } from "../db/index.js";
import { logger } from "../logging.js";
import { tautulliClient } from "../services.js";

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
}

const toRecipient = (r: Row): Recipient => ({
  id: r.id,
  name: r.name,
  email: r.email,
  enabled: !!r.enabled,
  source: r.source,
  createdAt: r.created_at,
  newsletterCount: r.newsletter_count,
});

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

  r.delete("/:id", (req, res) => {
    const changes = Number(db.prepare("DELETE FROM recipients WHERE id = ?").run(Number(req.params.id)).changes);
    if (!changes) return res.status(404).json({ error: "not found" });
    log.info({ id: req.params.id }, "recipient deleted");
    res.status(204).end();
  });

  /** Merge Plex users (via Tautulli) by email. Never removes anyone. New people start DISABLED. */
  r.post("/import/tautulli", async (_req, res) => {
    const users = await tautulliClient(db).users();
    const result: RecipientImportResult = { added: 0, updated: 0, skippedNoEmail: 0, alreadyPresent: 0 };
    tx(db, () => {
      const find = db.prepare("SELECT id, name FROM recipients WHERE email = ?");
      const add = db.prepare("INSERT INTO recipients(name, email, enabled, source) VALUES(?, ?, 0, 'tautulli')");
      const fillName = db.prepare("UPDATE recipients SET name = ? WHERE id = ?");
      for (const u of users) {
        const email = (u.email ?? "").trim().toLowerCase();
        if (!z.string().email().safeParse(email).success) {
          result.skippedNoEmail++;
          continue;
        }
        const name = (u.friendly_name || u.username || "").trim();
        const existing = find.get(email) as { id: number; name: string } | undefined;
        if (!existing) {
          add.run(name, email);
          result.added++;
        } else if (!existing.name && name) {
          fillName.run(name, existing.id);
          result.updated++;
        } else result.alreadyPresent++;
      }
    });
    log.info(result, "imported recipients from Tautulli");
    res.json(result);
  });

  return r;
}
