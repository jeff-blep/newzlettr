import { Router } from "express";
import { z } from "zod";
import type { RecipientList } from "../../../shared/types.js";
import type { DB } from "../db/index.js";
import { tx } from "../db/index.js";
import { logger } from "../logging.js";

interface Row {
  id: number;
  name: string;
  description: string;
  created_at: string;
}

export function listsRouter(db: DB): Router {
  const r = Router();
  const log = logger("lists");

  const toList = (row: Row): RecipientList => {
    const members = db
      .prepare("SELECT recipient_id AS id FROM recipient_list_members WHERE list_id = ?")
      .all(row.id) as { id: number }[];
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      createdAt: row.created_at,
      memberCount: members.length,
      memberIds: members.map((m) => m.id),
      usedBy: db
        .prepare("SELECT n.id, n.name FROM newsletter_lists nl JOIN newsletters n ON n.id = nl.newsletter_id WHERE nl.list_id = ? ORDER BY n.name")
        .all(row.id) as { id: number; name: string }[],
    };
  };
  const one = (id: number) => {
    const row = db.prepare("SELECT * FROM recipient_lists WHERE id = ?").get(id) as Row | undefined;
    return row ? toList(row) : null;
  };
  const dup = (e: unknown, name: string) => (/UNIQUE/.test((e as Error).message) ? `A list named “${name}” already exists` : null);

  const addMembers = (listId: number, ids: number[]) => {
    const ins = db.prepare("INSERT OR IGNORE INTO recipient_list_members(list_id, recipient_id) SELECT ?, id FROM recipients WHERE id = ?");
    let n = 0;
    for (const id of new Set(ids)) n += Number(ins.run(listId, id).changes);
    return n;
  };

  r.get("/", (_req, res) => {
    const rows = db.prepare("SELECT * FROM recipient_lists ORDER BY lower(name)").all() as unknown as Row[];
    res.json(rows.map(toList));
  });

  r.get("/:id", (req, res) => {
    const l = one(Number(req.params.id));
    return l ? res.json(l) : res.status(404).json({ error: "not found" });
  });

  const body = z.object({
    name: z.string().trim().min(1, "Name is required").max(80),
    description: z.string().trim().max(300).default(""),
    memberIds: z.array(z.number().int().positive()).max(10_000).default([]),
  });

  r.post("/", (req, res) => {
    const p = body.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message });
    try {
      const id = tx(db, () => {
        const out = db.prepare("INSERT INTO recipient_lists(name, description) VALUES(?, ?) RETURNING id").get(p.data.name, p.data.description) as { id: number };
        addMembers(out.id, p.data.memberIds);
        return out.id;
      });
      log.info({ id, members: p.data.memberIds.length }, "list created");
      res.status(201).json(one(id));
    } catch (e) {
      const msg = dup(e, p.data.name);
      if (msg) return res.status(409).json({ error: msg });
      throw e;
    }
  });

  r.put("/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!one(id)) return res.status(404).json({ error: "not found" });
    const p = body.omit({ memberIds: true }).partial().safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message });
    try {
      if (p.data.name !== undefined) db.prepare("UPDATE recipient_lists SET name = ? WHERE id = ?").run(p.data.name, id);
      if (p.data.description !== undefined) db.prepare("UPDATE recipient_lists SET description = ? WHERE id = ?").run(p.data.description, id);
    } catch (e) {
      const msg = dup(e, p.data.name ?? "");
      if (msg) return res.status(409).json({ error: msg });
      throw e;
    }
    res.json(one(id));
  });

  /** Add and/or remove members. */
  r.post("/:id/members", (req, res) => {
    const id = Number(req.params.id);
    if (!one(id)) return res.status(404).json({ error: "not found" });
    const p = z
      .object({ add: z.array(z.number().int().positive()).max(10_000).default([]), remove: z.array(z.number().int().positive()).max(10_000).default([]) })
      .safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message });
    const result = tx(db, () => {
      const added = addMembers(id, p.data.add);
      const del = db.prepare("DELETE FROM recipient_list_members WHERE list_id = ? AND recipient_id = ?");
      let removed = 0;
      for (const rid of new Set(p.data.remove)) removed += Number(del.run(id, rid).changes);
      return { added, removed };
    });
    log.info({ id, ...result }, "list members changed");
    res.json({ ...result, list: one(id) });
  });

  r.delete("/:id", (req, res) => {
    const n = Number(db.prepare("DELETE FROM recipient_lists WHERE id = ?").run(Number(req.params.id)).changes);
    if (!n) return res.status(404).json({ error: "not found" });
    log.info({ id: req.params.id }, "list deleted");
    res.status(204).end();
  });

  return r;
}
