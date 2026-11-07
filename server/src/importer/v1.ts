import type { DB } from "../db/index.js";
import { tx } from "../db/index.js";
import { normalizeBaseUrl } from "../integrations/http.js";
import { setSection } from "../settings.js";
import { v1ScheduleToCron } from "../schedule.js";

/** Shapes as written by Newzlettr v1 (server/index.mjs). Everything optional: v1 files vary. */
export interface V1Files {
  config?: Record<string, unknown>;
  recipients?: unknown;
  templates?: unknown;
  newsletters?: unknown;
}

export interface ImportSummary {
  settings: string[];
  recipients: number;
  templates: number;
  newsletters: number;
  hostPick: boolean;
  notes: string[];
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || d);
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const arr = (v: unknown) => (Array.isArray(v) ? v : []);

/** "My Newsletter <me@example.com>" -> { name, address } */
export function parseFrom(raw: string): { name: string; address: string } {
  const m = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1]!.trim(), address: m[2]!.trim() } : { name: "", address: raw.trim() };
}

/** Imports v1 data. Newsletters are imported DISABLED so nothing sends until you turn it on. */
export function importV1(db: DB, files: V1Files): ImportSummary {
  const s: ImportSummary = { settings: [], recipients: 0, templates: 0, newsletters: 0, hostPick: false, notes: [] };

  tx(db, () => {
    /* ------------------------------- settings ------------------------------- */
    if (files.config) {
      const c = files.config;
      const plex = obj(c.plex);
      const plexUrl = str(c.plexUrl) || str(plex.url) || str(plex.baseUrl);
      const plexToken = str(c.plexToken) || str(plex.token);
      if (plexUrl || plexToken) {
        setSection(db, "plex", { url: normalizeBaseUrl(plexUrl), token: plexToken });
        s.settings.push("Plex");
      }

      const t = obj(c.tautulli);
      const tUrl = str(c.tautulliUrl) || str(t.baseUrl) || str(t.url);
      const tKey = str(c.tautulliApiKey) || str(t.apiKey);
      if (tUrl || tKey) {
        setSection(db, "tautulli", { url: normalizeBaseUrl(tUrl), apiKey: tKey });
        s.settings.push("Tautulli");
      }

      const host = str(c.smtpHost) || str(c.smtpServer);
      if (host) {
        const port = num(c.smtpPort, 587);
        const secure = c.smtpSecure === true || str(c.smtpEncryption) === "TLS/SSL";
        const from = parseFrom(str(c.fromAddress));
        setSection(db, "smtp", {
          host,
          port,
          encryption: secure ? "ssl" : port === 25 ? "none" : "starttls",
          username: str(c.smtpUser) || str(c.smtpEmailLogin),
          password: str(c.smtpPass),
          fromName: from.name || "Newzlettr",
          fromAddress: from.address || str(c.smtpUser),
        });
        s.settings.push("Email");
      }

      const cl = obj(c.cloudinary);
      if (str(c.imageHost) || str(cl.cloudName)) {
        setSection(db, "images", {
          mode: str(c.imageHost) === "cloudinary" ? "cloudinary" : "embedded",
          cloudName: str(cl.cloudName),
          apiKey: str(cl.apiKey),
          apiSecret: str(cl.apiSecret),
          folder: str(cl.folder) || "newzlettr",
        });
        s.settings.push("Images");
      }

      const days = num(c.lookbackDays, 0);
      if (days >= 1 && days <= 90) {
        setSection(db, "general", { defaultHistoryDays: days });
        s.settings.push("Default history");
      }

      const rec = obj(c.ownerRecommendation);
      if (str(rec.plexItemId) || str(rec.note)) {
        db.prepare(
          `INSERT INTO host_pick(id, plex_item_id, note) VALUES(1, ?, ?)
           ON CONFLICT(id) DO UPDATE SET plex_item_id = excluded.plex_item_id, note = excluded.note,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
        ).run(str(rec.plexItemId) || null, str(rec.note));
        s.hostPick = true;
      }
    }

    /* ------------------------------- recipients ------------------------------ */
    const addRecipient = db.prepare(
      `INSERT INTO recipients(name, email, source) VALUES(?, ?, 'import')
       ON CONFLICT(email) DO UPDATE SET name = CASE WHEN recipients.name = '' THEN excluded.name ELSE recipients.name END`,
    );
    for (const r of arr(files.recipients)) {
      const o = obj(r);
      const email = (str(o.email) || (typeof r === "string" ? r : "")).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
      addRecipient.run(str(o.fullName) || str(o.name), email);
      s.recipients++;
    }

    /* -------------------------------- templates ------------------------------- */
    const v1TemplateIds = new Map<string, number>();
    const v1TemplateNames = new Map<string, number>();
    const upsertTemplate = db.prepare(
      `INSERT INTO templates(name, html) VALUES(?, ?)
       ON CONFLICT(name) DO UPDATE SET html = excluded.html, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       RETURNING id`,
    );
    for (const t of arr(files.templates)) {
      const o = obj(t);
      const name = str(o.name);
      if (!name) continue;
      const row = upsertTemplate.get(name, typeof o.html === "string" ? o.html : "") as { id: number };
      if (str(o.id)) v1TemplateIds.set(str(o.id), row.id);
      v1TemplateNames.set(name.toLowerCase(), row.id);
      s.templates++;
    }

    /* ------------------------------- newsletters ------------------------------ */
    const allEmails = new Set(
      (db.prepare("SELECT email FROM recipients").all() as { email: string }[]).map((r) => r.email.toLowerCase()),
    );
    const insertNl = db.prepare(
      `INSERT INTO newsletters(name, subject, template_id, schedule, history_days, send_as_bcc, all_recipients, enabled)
       VALUES(?, ?, ?, ?, ?, ?, ?, 0) RETURNING id`,
    );
    const link = db.prepare(
      "INSERT OR IGNORE INTO newsletter_recipients(newsletter_id, recipient_id) SELECT ?, id FROM recipients WHERE email = ?",
    );
    for (const n of arr(files.newsletters)) {
      const o = obj(n);
      const name = str(o.name);
      if (!name) continue;
      const templateId = v1TemplateIds.get(str(o.templateId)) ?? v1TemplateNames.get(str(o.templateName).toLowerCase()) ?? null;
      const emails = arr(o.recipients).map((e) => str(e).toLowerCase()).filter(Boolean);
      const all = emails.length > 0 && emails.length === allEmails.size && emails.every((e) => allEmails.has(e));
      const cron = v1ScheduleToCron(obj(o.schedule));
      const historyDays = num(o.historyDays, 0);
      const row = insertNl.get(
        name,
        str(o.subject),
        templateId,
        JSON.stringify({ cron }),
        historyDays >= 1 && historyDays <= 90 ? historyDays : null,
        o.sendAsBcc === false ? 0 : 1,
        all ? 1 : 0,
      ) as { id: number };
      if (!all) for (const e of emails) link.run(row.id, e);
      s.newsletters++;
      if (o.enabled) s.notes.push(`"${name}" was enabled in v1 — imported disabled; turn it on when ready.`);
    }
  });

  return s;
}
