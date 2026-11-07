import { Router } from "express";
import { z } from "zod";
import type { Newsletter, SchedulePreview, SendRecord } from "../../../shared/types.js";
import type { DB } from "../db/index.js";
import { tx } from "../db/index.js";
import { runHealthChecks } from "../health.js";
import { logger } from "../logging.js";
import { audience, cronOf, getNewsletterRow, type NewsletterRow, sendNewsletter, toSendRecord } from "../mail/newsletter.js";
import { resolveForPreview } from "../render/images.js";
import { renderNewsletter } from "../render/render.js";
import { describeCron, nextRuns, validateCron } from "../schedule.js";
import { effectiveTimezone, getSection } from "../settings.js";

const input = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  subject: z.string().trim().max(200).default(""),
  templateId: z.number().int().positive().nullable().default(null),
  cron: z.string().trim().min(1, "Pick a schedule"),
  historyDays: z.number().int().min(1).max(90).nullable().default(null),
  sendAsBcc: z.boolean().default(true),
  allRecipients: z.boolean().default(false),
  listIds: z.array(z.number().int().positive()).max(500).default([]),
  recipientIds: z.array(z.number().int().positive()).max(5000).default([]),
  enabled: z.boolean().default(false),
});

export function newslettersRouter(db: DB): Router {
  const r = Router();
  const log = logger("newsletters");

  const toNewsletter = (row: NewsletterRow): Newsletter => {
    const tz = effectiveTimezone(db);
    const cron = cronOf(row);
    const tpl = row.template_id ? (db.prepare("SELECT name FROM templates WHERE id = ?").get(row.template_id) as { name: string } | undefined) : undefined;
    const last = db.prepare("SELECT * FROM sends WHERE newsletter_id = ? AND trigger != 'test' ORDER BY id DESC LIMIT 1").get(row.id) as
      | Record<string, unknown>
      | undefined;
    return {
      id: row.id,
      name: row.name,
      subject: row.subject,
      templateId: row.template_id,
      templateName: tpl?.name ?? null,
      cron,
      scheduleDescription: validateCron(cron) ? "Invalid schedule" : describeCron(cron),
      historyDays: row.history_days,
      sendAsBcc: !!row.send_as_bcc,
      allRecipients: !!row.all_recipients,
      listIds: (db.prepare("SELECT list_id FROM newsletter_lists WHERE newsletter_id = ?").all(row.id) as { list_id: number }[]).map((x) => x.list_id),
      recipientIds: (db.prepare("SELECT recipient_id FROM newsletter_recipients WHERE newsletter_id = ?").all(row.id) as { recipient_id: number }[]).map(
        (x) => x.recipient_id,
      ),
      audienceCount: audience(db, row).length,
      enabled: !!row.enabled,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      nextRuns: row.enabled && !validateCron(cron) ? nextRuns(cron, tz, 3).map((d) => d.toISOString()) : [],
      lastSend: last ? toSendRecord(last) : null,
    };
  };

  const one = (id: number) => {
    const row = getNewsletterRow(db, id);
    return row ? toNewsletter(row) : null;
  };

  const write = (id: number | null, d: z.infer<typeof input>): number =>
    tx(db, () => {
      const schedule = JSON.stringify({ cron: d.cron });
      let nid = id;
      if (nid === null) {
        nid = Number(
          (
            db
              .prepare(
                `INSERT INTO newsletters(name, subject, template_id, schedule, history_days, send_as_bcc, all_recipients, enabled)
                 VALUES(?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
              )
              .get(d.name, d.subject, d.templateId, schedule, d.historyDays, d.sendAsBcc ? 1 : 0, d.allRecipients ? 1 : 0, d.enabled ? 1 : 0) as { id: number }
          ).id,
        );
      } else {
        db.prepare(
          `UPDATE newsletters SET name = ?, subject = ?, template_id = ?, schedule = ?, history_days = ?, send_as_bcc = ?,
             all_recipients = ?, enabled = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
        ).run(d.name, d.subject, d.templateId, schedule, d.historyDays, d.sendAsBcc ? 1 : 0, d.allRecipients ? 1 : 0, d.enabled ? 1 : 0, nid);
      }
      db.prepare("DELETE FROM newsletter_recipients WHERE newsletter_id = ?").run(nid);
      db.prepare("DELETE FROM newsletter_lists WHERE newsletter_id = ?").run(nid);
      if (!d.allRecipients) {
        const link = db.prepare("INSERT OR IGNORE INTO newsletter_recipients(newsletter_id, recipient_id) SELECT ?, id FROM recipients WHERE id = ?");
        for (const rid of d.recipientIds) link.run(nid, rid);
        const linkList = db.prepare("INSERT OR IGNORE INTO newsletter_lists(newsletter_id, list_id) SELECT ?, id FROM recipient_lists WHERE id = ?");
        for (const lid of d.listIds) linkList.run(nid, lid);
      }
      return nid;
    });

  const validate = (body: unknown) => {
    const p = input.safeParse(body);
    if (!p.success) return { error: p.error.issues[0]?.message ?? "invalid" } as const;
    const cronErr = validateCron(p.data.cron);
    if (cronErr) return { error: `Schedule: ${cronErr}` } as const;
    if (p.data.templateId && !db.prepare("SELECT 1 FROM templates WHERE id = ?").get(p.data.templateId)) return { error: "That template no longer exists" } as const;
    return { data: p.data } as const;
  };

  r.get("/", (_req, res) => {
    const rows = db.prepare("SELECT * FROM newsletters ORDER BY lower(name)").all() as unknown as NewsletterRow[];
    res.json(rows.map(toNewsletter));
  });

  r.get("/:id", (req, res) => {
    const n = one(Number(req.params.id));
    return n ? res.json(n) : res.status(404).json({ error: "not found" });
  });

  r.post("/", (req, res) => {
    const v = validate(req.body);
    if ("error" in v) return res.status(400).json({ error: v.error });
    const id = write(null, v.data);
    log.info({ id, enabled: v.data.enabled }, "newsletter created");
    void runHealthChecks(db);
    res.status(201).json(one(id));
  });

  r.put("/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!getNewsletterRow(db, id)) return res.status(404).json({ error: "not found" });
    const v = validate(req.body);
    if ("error" in v) return res.status(400).json({ error: v.error });
    write(id, v.data);
    log.info({ id, enabled: v.data.enabled }, "newsletter saved");
    void runHealthChecks(db);
    res.json(one(id));
  });

  /** Quick enable/disable from the list. */
  r.post("/:id/enabled", (req, res) => {
    const id = Number(req.params.id);
    const enabled = !!req.body?.enabled;
    const n = Number(
      db.prepare("UPDATE newsletters SET enabled = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(enabled ? 1 : 0, id).changes,
    );
    if (!n) return res.status(404).json({ error: "not found" });
    log.info({ id, enabled }, "newsletter toggled");
    void runHealthChecks(db);
    res.json(one(id));
  });

  r.delete("/:id", (req, res) => {
    const n = Number(db.prepare("DELETE FROM newsletters WHERE id = ?").run(Number(req.params.id)).changes);
    if (!n) return res.status(404).json({ error: "not found" });
    log.info({ id: req.params.id }, "newsletter deleted");
    res.status(204).end();
  });

  /** Render exactly what would be sent now (preview mode images). */
  r.get("/:id/preview", async (req, res) => {
    const row = getNewsletterRow(db, Number(req.params.id));
    if (!row) return res.status(404).json({ error: "not found" });
    const tpl = row.template_id ? (db.prepare("SELECT html FROM templates WHERE id = ?").get(row.template_id) as { html: string } | undefined) : undefined;
    if (!tpl) return res.status(400).json({ error: "This newsletter has no template" });
    const days = row.history_days ?? getSection(db, "general").defaultHistoryDays;
    const out = await renderNewsletter(db, { templateHtml: tpl.html, days, subject: row.subject || row.name });
    const html = resolveForPreview(out.html);
    res.json({ html, warnings: out.warnings, bytes: Buffer.byteLength(html) });
  });

  /** Send now to the real audience, or { testTo } for a single-address test. */
  r.post("/:id/send", async (req, res) => {
    const id = Number(req.params.id);
    if (!getNewsletterRow(db, id)) return res.status(404).json({ error: "not found" });
    const testTo = req.body?.testTo;
    if (testTo !== undefined && !z.string().email().safeParse(testTo).success) return res.status(400).json({ error: "Enter a valid email address" });
    const rec: SendRecord = await sendNewsletter(db, id, testTo ? { trigger: "test", testTo } : { trigger: "manual" });
    res.json(rec);
  });

  return r;
}

export function scheduleRouter(db: DB): Router {
  const r = Router();
  r.post("/preview", (req, res) => {
    const cron = String(req.body?.cron ?? "").trim();
    const tz = effectiveTimezone(db);
    const err = validateCron(cron);
    const body: SchedulePreview = err
      ? { valid: false, error: err, timezone: tz, next: [], description: "" }
      : { valid: true, timezone: tz, next: nextRuns(cron, tz, 3).map((d) => d.toISOString()), description: describeCron(cron) };
    res.json(body);
  });
  return r;
}

export function activityRouter(db: DB): Router {
  const r = Router();
  r.get("/", (req, res) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const status = typeof req.query.status === "string" && ["sent", "failed", "skipped", "running"].includes(req.query.status) ? req.query.status : null;
    const where = status ? "WHERE status = ?" : "";
    const args = status ? [status] : [];
    // Whitelisted sort columns only - the value is interpolated into SQL.
    const SORTS: Record<string, string> = {
      when: "started_at",
      newsletter: "lower(newsletter_name)",
      type: "trigger",
      status: "status",
      recipients: "recipient_count",
    };
    const sortCol = SORTS[String(req.query.sort)] ?? SORTS.when!;
    const dir = req.query.dir === "asc" ? "ASC" : "DESC";
    const rows = db.prepare(`SELECT * FROM sends ${where} ORDER BY ${sortCol} ${dir}, id ${dir} LIMIT ? OFFSET ?`).all(...args, limit, offset) as Record<string, unknown>[];
    const total = (db.prepare(`SELECT COUNT(*) AS n FROM sends ${where}`).get(...args) as { n: number }).n;
    res.json({ total, records: rows.map(toSendRecord) });
  });
  return r;
}
