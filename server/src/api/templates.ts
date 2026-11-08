import { Router } from "express";
import { z } from "zod";
import type { RenderResult, Template } from "../../../shared/types.js";
import type { DB } from "../db/index.js";
import { logger } from "../logging.js";
import { sendMail } from "../mail/send.js";
import { resolveForEmail, resolveForPreview } from "../render/images.js";
import { renderNewsletter } from "../render/render.js";
import { htmlToText } from "../render/sanitize.js";
import { CARDS } from "../render/tokens.js";
import { getSection } from "../settings.js";

interface Row {
  id: number;
  name: string;
  html: string;
  updated_at: string;
}

export function templatesRouter(db: DB): Router {
  const r = Router();
  const log = logger("templates");

  const usedBy = (id: number) => db.prepare("SELECT id, name FROM newsletters WHERE template_id = ? ORDER BY name").all(id) as { id: number; name: string }[];
  const toTemplate = (row: Row): Template => ({ id: row.id, name: row.name, html: row.html, updatedAt: row.updated_at, usedBy: usedBy(row.id) });
  const one = (id: number) => {
    const row = db.prepare("SELECT * FROM templates WHERE id = ?").get(id) as Row | undefined;
    return row ? toTemplate(row) : null;
  };
  const uniqueErr = (e: unknown, name: string) => (/UNIQUE/.test((e as Error).message) ? `A template named “${name}” already exists` : null);

  r.get("/cards", (_req, res) => res.json(CARDS.map(({ id: _id, ...c }) => c)));

  r.get("/", (_req, res) => {
    const rows = db.prepare("SELECT * FROM templates ORDER BY updated_at DESC").all() as unknown as Row[];
    res.json(rows.map(toTemplate));
  });

  r.get("/:id", (req, res) => {
    const t = one(Number(req.params.id));
    return t ? res.json(t) : res.status(404).json({ error: "not found" });
  });

  const body = z.object({ name: z.string().trim().min(1, "Name is required").max(100), html: z.string().max(500_000).default("") });

  r.post("/", (req, res) => {
    const p = body.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message });
    try {
      const out = db.prepare("INSERT INTO templates(name, html) VALUES(?, ?) RETURNING id").get(p.data.name, p.data.html) as { id: number };
      log.info({ id: out.id }, "template created");
      res.status(201).json(one(out.id));
    } catch (e) {
      const msg = uniqueErr(e, p.data.name);
      if (msg) return res.status(409).json({ error: msg });
      throw e;
    }
  });

  r.put("/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!one(id)) return res.status(404).json({ error: "not found" });
    const p = body.partial().safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message });
    try {
      if (p.data.name !== undefined) db.prepare("UPDATE templates SET name = ? WHERE id = ?").run(p.data.name, id);
      if (req.body && "html" in req.body) db.prepare("UPDATE templates SET html = ? WHERE id = ?").run(p.data.html ?? "", id);
      db.prepare("UPDATE templates SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(id);
    } catch (e) {
      const msg = uniqueErr(e, p.data.name ?? "");
      if (msg) return res.status(409).json({ error: msg });
      throw e;
    }
    res.json(one(id));
  });

  r.post("/:id/duplicate", (req, res) => {
    const src = one(Number(req.params.id));
    if (!src) return res.status(404).json({ error: "not found" });
    let name = `${src.name} (copy)`;
    for (let i = 2; db.prepare("SELECT 1 FROM templates WHERE name = ?").get(name); i++) name = `${src.name} (copy ${i})`;
    const out = db.prepare("INSERT INTO templates(name, html) VALUES(?, ?) RETURNING id").get(name, src.html) as { id: number };
    res.status(201).json(one(out.id));
  });

  r.delete("/:id", (req, res) => {
    const changes = Number(db.prepare("DELETE FROM templates WHERE id = ?").run(Number(req.params.id)).changes);
    if (!changes) return res.status(404).json({ error: "not found" });
    log.info({ id: req.params.id }, "template deleted");
    res.status(204).end();
  });

  return r;
}

/** Preview + test send for unsaved template HTML (the editor uses these). */
export function renderRouter(db: DB): Router {
  const r = Router();
  const input = z.object({
    html: z.string().max(500_000),
    days: z.number().int().min(1).max(365).optional(),
    subject: z.string().max(200).optional(),
    scheme: z.enum(["light", "dark"]).optional(),
  });

  r.post("/preview", async (req, res) => {
    const p = input.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message });
    const days = p.data.days ?? getSection(db, "general").defaultHistoryDays;
    const out = await renderNewsletter(db, { templateHtml: p.data.html, days, subject: p.data.subject, previewScheme: p.data.scheme });
    const html = resolveForPreview(out.html);
    res.json({ html, warnings: out.warnings, bytes: Buffer.byteLength(html) } satisfies RenderResult);
  });

  r.post("/test-send", async (req, res) => {
    const p = input.extend({ to: z.string().trim().email("Enter a valid email address") }).safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message });
    const days = p.data.days ?? getSection(db, "general").defaultHistoryDays;
    const subject = `[Test] ${p.data.subject || "Newsletter preview"}`;
    const out = await renderNewsletter(db, { templateHtml: p.data.html, days, subject });
    const email = await resolveForEmail(db, out.html);
    try {
      const sent = await sendMail(db, { to: [p.data.to], subject, html: email.html, text: htmlToText(email.html), attachments: email.attachments });
      res.json({
        ok: true,
        message: `Test sent to ${sent.redirected ? "the dev redirect address" : p.data.to}.`,
        warnings: [...out.warnings, ...email.warnings],
      });
    } catch (e) {
      res.json({ ok: false, message: (e as Error).message, warnings: out.warnings });
    }
  });

  return r;
}
