import type { SendRecord, SendTrigger } from "../../../shared/types.js";
import type { DB } from "../db/index.js";
import { smtpConfigured } from "../integrations/mail.js";
import { logger } from "../logging.js";
import { resolveForEmail } from "../render/images.js";
import { renderNewsletter } from "../render/render.js";
import { htmlToText } from "../render/sanitize.js";
import { DEFAULT_LOOK, EMAIL_THEMES, type EmailTheme, getSection, HEX_COLOR, type Look } from "../settings.js";
import { sendMail } from "./send.js";

const log = logger("newsletter");

export interface NewsletterRow {
  id: number;
  name: string;
  subject: string;
  template_id: number | null;
  schedule: string;
  history_days: number | null;
  send_as_bcc: number;
  all_recipients: number;
  enabled: number;
  email_theme: string;
  accent_color: string;
  header_title: string;
  footer_text: string;
  created_at: string;
  updated_at: string;
}

export function getNewsletterRow(db: DB, id: number): NewsletterRow | null {
  return (db.prepare("SELECT * FROM newsletters WHERE id = ?").get(id) as NewsletterRow | undefined) ?? null;
}

export function lookOf(row: NewsletterRow): Look {
  const emailTheme = (EMAIL_THEMES as readonly string[]).includes(row.email_theme) ? (row.email_theme as EmailTheme) : DEFAULT_LOOK.emailTheme;
  const accentColor = HEX_COLOR.test(row.accent_color) ? row.accent_color : DEFAULT_LOOK.accentColor;
  return { emailTheme, accentColor, headerTitle: row.header_title ?? "", footerText: row.footer_text ?? "" };
}

export function cronOf(row: NewsletterRow): string {
  try {
    return (JSON.parse(row.schedule) as { cron?: string }).cron ?? "";
  } catch {
    return "";
  }
}

/**
 * Who a newsletter reaches, de-duplicated:
 * - "All recipients": everyone on the Recipients page.
 * - Otherwise: members of the chosen lists + individually picked people.
 */
export function audience(db: DB, row: NewsletterRow): string[] {
  const rows = row.all_recipients
    ? db.prepare("SELECT email FROM recipients ORDER BY email").all()
    : db
        .prepare(
          `SELECT DISTINCT r.email FROM recipients r
           WHERE (
             r.id IN (SELECT recipient_id FROM newsletter_recipients WHERE newsletter_id = ?)
             OR r.id IN (SELECT m.recipient_id FROM recipient_list_members m
                         JOIN newsletter_lists nl ON nl.list_id = m.list_id WHERE nl.newsletter_id = ?)
           )
           ORDER BY r.email`,
        )
        .all(row.id, row.id);
  return (rows as { email: string }[]).map((r) => r.email);
}

export function toSendRecord(r: Record<string, unknown>): SendRecord {
  return {
    id: Number(r.id),
    newsletterId: r.newsletter_id == null ? null : Number(r.newsletter_id),
    newsletterName: String(r.newsletter_name ?? ""),
    trigger: r.trigger as SendTrigger,
    scheduledFor: (r.scheduled_for as string | null) ?? null,
    status: r.status as SendRecord["status"],
    recipientCount: Number(r.recipient_count ?? 0),
    error: (r.error as string | null) ?? null,
    startedAt: String(r.started_at),
    finishedAt: (r.finished_at as string | null) ?? null,
  };
}

export class SlotTakenError extends Error {}

/**
 * Sends one newsletter. For scheduled runs the slot is claimed in the DB first; the UNIQUE
 * index on (newsletter_id, scheduled_for) makes a second claim of the same slot fail, so a
 * newsletter can never go out twice for one schedule tick (the v1 duplicate-email bug).
 *
 * `testTo` sends only to that address (trigger "test") and never claims a slot.
 */
export async function sendNewsletter(
  db: DB,
  id: number,
  opts: { trigger: SendTrigger; scheduledFor?: string; testTo?: string },
): Promise<SendRecord> {
  const row = getNewsletterRow(db, id);
  if (!row) throw new Error("Newsletter not found");

  let sendId: number;
  try {
    sendId = Number(
      (
        db
          .prepare("INSERT INTO sends(newsletter_id, newsletter_name, trigger, scheduled_for, status) VALUES(?, ?, ?, ?, 'running') RETURNING id")
          .get(id, row.name, opts.trigger, opts.scheduledFor ?? null) as { id: number }
      ).id,
    );
  } catch (e) {
    if (/UNIQUE/.test((e as Error).message)) throw new SlotTakenError(`slot ${opts.scheduledFor} already claimed`);
    throw e;
  }

  const finish = (status: SendRecord["status"], count: number, error: string | null) => {
    db.prepare("UPDATE sends SET status = ?, recipient_count = ?, error = ?, finished_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(
      status,
      count,
      error,
      sendId,
    );
    return toSendRecord(db.prepare("SELECT * FROM sends WHERE id = ?").get(sendId) as Record<string, unknown>);
  };

  try {
    const tpl = row.template_id ? (db.prepare("SELECT html FROM templates WHERE id = ?").get(row.template_id) as { html: string } | undefined) : undefined;
    if (!tpl) return finish("failed", 0, "No template selected");
    if (!smtpConfigured(getSection(db, "smtp"))) return finish("failed", 0, "Email (SMTP) isn't configured");

    const to = opts.testTo ? [opts.testTo] : audience(db, row);
    if (!to.length) return finish("failed", 0, "No enabled recipients");

    const days = row.history_days ?? getSection(db, "general").defaultHistoryDays;
    const subject = (opts.testTo ? "[Test] " : "") + (row.subject.trim() || row.name);
    const rendered = await renderNewsletter(db, { templateHtml: tpl.html, days, subject, look: lookOf(row) });
    const email = await resolveForEmail(db, rendered.html);
    const text = htmlToText(email.html);
    const warnings = [...rendered.warnings, ...email.warnings];

    if (opts.testTo || row.send_as_bcc) {
      await sendMail(db, { to: opts.testTo ? to : [], bcc: opts.testTo ? [] : to, subject, html: email.html, text, attachments: email.attachments });
    } else {
      // Not BCC: one email per person so nobody sees anyone else's address.
      const failures: string[] = [];
      for (const addr of to) {
        try {
          await sendMail(db, { to: [addr], subject, html: email.html, text, attachments: email.attachments });
        } catch (e) {
          failures.push(`${addr}: ${(e as Error).message}`);
        }
      }
      if (failures.length === to.length) throw new Error(failures[0]);
      if (failures.length) warnings.push(`${failures.length} of ${to.length} failed: ${failures.slice(0, 3).join("; ")}`);
    }

    log.info({ newsletter: row.name, trigger: opts.trigger, recipients: to.length, warnings: warnings.length }, "newsletter sent");
    return finish("sent", to.length, warnings.length ? `Sent with warnings: ${warnings.join(" | ")}` : null);
  } catch (e) {
    log.error({ err: e, newsletter: row.name }, "newsletter send failed");
    return finish("failed", 0, (e as Error).message);
  }
}
