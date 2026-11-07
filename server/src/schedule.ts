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

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function clock(h: number, m: number): string {
  const ap = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ap}`;
}

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  return `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th"}`;
}

/** Plain-English description for the common shapes; falls back to the raw expression. */
export function describeCron(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;
  const [mi, h, dom, mon, dow] = parts as [string, string, string, string, string];
  const isNum = (s: string) => /^\d+$/.test(s);
  if (!isNum(mi)) return `Custom: ${expr}`;
  if (h === "*" && dom === "*" && mon === "*" && dow === "*") return `Every hour at :${mi.padStart(2, "0")}`;
  if (!isNum(h)) return `Custom: ${expr}`;
  const at = clock(Number(h), Number(mi));
  if (dom === "*" && mon === "*" && dow === "*") return `Every day at ${at}`;
  if (dom === "*" && mon === "*" && /^[0-7](,[0-7])*$/.test(dow)) {
    const days = dow.split(",").map((d) => DAY_NAMES[Number(d) % 7]!);
    if (days.length === 5 && !days.includes("Saturday") && !days.includes("Sunday")) return `Weekdays at ${at}`;
    return `Every ${days.join(", ")} at ${at}`;
  }
  if (isNum(dom) && mon === "*" && dow === "*") return `Monthly on the ${ordinal(Number(dom))} at ${at}`;
  return `Custom: ${expr}`;
}
