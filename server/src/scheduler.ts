import type { HealthCheck } from "../../shared/types.js";
import type { DB } from "./db/index.js";
import { logger } from "./logging.js";
import { cronOf, type NewsletterRow, sendNewsletter, SlotTakenError, audience } from "./mail/newsletter.js";
import { slotsBetween, validateCron } from "./schedule.js";
import { effectiveTimezone } from "./settings.js";

const log = logger("scheduler");

/** A slot is sent if we notice it within this long; older missed slots are recorded as skipped. */
export const GRACE_MS = 15 * 60_000;
/** How far back we look for missed slots to report. */
const MISSED_LOOKBACK_MS = 24 * 3600_000;

/**
 * One scheduler pass. Safe to call concurrently or repeatedly: every slot is claimed through
 * the sends UNIQUE index, so each (newsletter, slot) is acted on at most once.
 */
export async function runDueNewsletters(db: DB, now = new Date()): Promise<{ sent: number; skipped: number }> {
  const tz = effectiveTimezone(db);
  const rows = db.prepare("SELECT * FROM newsletters WHERE enabled = 1").all() as unknown as NewsletterRow[];
  let sent = 0;
  let skipped = 0;

  for (const row of rows) {
    const cron = cronOf(row);
    if (!cron || validateCron(cron)) continue;
    // Never act on slots from before the newsletter was last saved (e.g. enabling at 08:01
    // must not immediately fire the 08:00 slot).
    const since = new Date(Math.max(now.getTime() - MISSED_LOOKBACK_MS, Date.parse(row.updated_at + (row.updated_at.endsWith("Z") ? "" : "Z"))));
    for (const slot of slotsBetween(cron, tz, since, now)) {
      const iso = slot.toISOString();
      const late = now.getTime() - slot.getTime();
      if (late > GRACE_MS) {
        // Missed while offline: record once so it shows in Activity, but don't send stale news.
        const res = db
          .prepare(
            `INSERT OR IGNORE INTO sends(newsletter_id, newsletter_name, trigger, scheduled_for, status, error, finished_at)
             VALUES(?, ?, 'scheduled', ?, 'skipped', ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
          )
          .run(row.id, row.name, iso, `Missed: Newzlettr wasn't running at the scheduled time (noticed ${Math.round(late / 60000)} min late)`);
        if (Number(res.changes)) {
          skipped++;
          log.warn({ newsletter: row.name, slot: iso }, "missed scheduled send");
        }
        continue;
      }
      try {
        const r = await sendNewsletter(db, row.id, { trigger: "scheduled", scheduledFor: iso });
        if (r.status === "sent") sent++;
      } catch (e) {
        if (!(e instanceof SlotTakenError)) log.error({ err: e, newsletter: row.name }, "scheduled send crashed");
      }
    }
  }
  return { sent, skipped };
}

/** Health contributions: things that would make a scheduled send fail or do nothing. */
export function newsletterHealth(db: DB): HealthCheck[] {
  const out: HealthCheck[] = [];
  const rows = db.prepare("SELECT * FROM newsletters WHERE enabled = 1").all() as unknown as NewsletterRow[];
  for (const row of rows) {
    if (!row.template_id) out.push({ source: "newsletters", level: "error", message: `“${row.name}” has no template, so it can't send`, fixPath: "/newsletters" });
    else if (!audience(db, row).length) out.push({ source: "newsletters", level: "error", message: `“${row.name}” would reach nobody — pick a list or people`, fixPath: "/newsletters" });
    const cronErr = validateCron(cronOf(row));
    if (cronErr) out.push({ source: "newsletters", level: "error", message: `“${row.name}” has an invalid schedule: ${cronErr}`, fixPath: "/newsletters" });
    const last = db.prepare("SELECT status, error FROM sends WHERE newsletter_id = ? AND trigger != 'test' ORDER BY id DESC LIMIT 1").get(row.id) as
      | { status: string; error: string | null }
      | undefined;
    if (last?.status === "failed") out.push({ source: "sends", level: "error", message: `Last send of “${row.name}” failed: ${last.error ?? "unknown error"}`, fixPath: "/activity" });
  }
  return out;
}
