import { Cron } from "croner";

/**
 * Newsletter schedules are stored as a 5-field cron expression evaluated in the effective
 * timezone (Settings > General). The UI offers a simple picker that produces these.
 */
export interface NewsletterSchedule {
  cron: string;
}

export const DEFAULT_CRON = "0 8 * * 0"; // Sundays 08:00

const DOW: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

/** Converts a v1 schedule object to cron. v1 "hour"/"minute" were container-local clock values. */
export function v1ScheduleToCron(s: Record<string, unknown>): string {
  const custom = typeof s.cron === "string" ? s.cron.trim() : "";
  if (custom && validateCron(custom) === null) return custom;
  const minute = clampInt(s.minute, 0, 59, 0);
  const hour = clampInt(s.hour, 0, 23, 8);
  switch (String(s.frequency ?? "week").toLowerCase()) {
    case "hour":
      return `${minute} * * * *`;
    case "day":
      return `${minute} ${hour} * * *`;
    case "month":
      return `${minute} ${hour} ${clampInt(s.dayOfMonth, 1, 28, 1)} * *`;
    case "year":
      return `${minute} ${hour} 1 ${clampInt(s.month, 0, 11, 0) + 1} *`;
    default:
      return `${minute} ${hour} * * ${DOW[String(s.dayOfWeek ?? "sunday").toLowerCase()] ?? 0}`;
  }
}

function clampInt(v: unknown, min: number, max: number, d: number): number {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
}

/** null when valid, else a readable error. Only 5-field cron (no seconds). */
export function validateCron(expr: string): string | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return "Use 5 fields: minute hour day-of-month month day-of-week";
  try {
    new Cron(expr, { paused: true });
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/** Next N run times after `from` in `timezone`. */
export function nextRuns(expr: string, timezone: string, count = 3, from = new Date()): Date[] {
  try {
    const c = new Cron(expr, { timezone, paused: true });
    return c.nextRuns(count, from);
  } catch {
    return [];
  }
}

/** Scheduled slots in the half-open window (from, to]. Used to find what's due / missed. */
export function slotsBetween(expr: string, timezone: string, from: Date, to: Date, max = 100): Date[] {
  const out: Date[] = [];
  try {
    const c = new Cron(expr, { timezone, paused: true });
    let cursor = from;
    while (out.length < max) {
      const next = c.nextRun(cursor);
      if (!next || next > to) break;
      out.push(next);
      cursor = next;
    }
  } catch {
    /* invalid expression -> nothing due */
  }
  return out;
}
