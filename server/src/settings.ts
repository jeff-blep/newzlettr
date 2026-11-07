import crypto from "node:crypto";
import { z } from "zod";
import type { DB } from "./db/index.js";

/**
 * Settings are stored one row per section, value = JSON. Each section has a zod schema that
 * supplies defaults, so adding a field later never needs a migration.
 */
export const generalSchema = z.object({
  authMethod: z.enum(["forms", "forms-local-bypass"]).default("forms"),
  timezone: z.string().default(""),
  defaultHistoryDays: z.number().int().min(1).max(90).default(7),
  logLevel: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
  applicationUrl: z.string().default(""),
});

export const SECTIONS = {
  general: generalSchema,
} as const;

export type SectionName = keyof typeof SECTIONS;
export type Section<N extends SectionName> = z.infer<(typeof SECTIONS)[N]>;

export function getSection<N extends SectionName>(db: DB, name: N): Section<N> {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(name) as { value: string } | undefined;
  let raw: unknown = {};
  try {
    raw = row ? JSON.parse(row.value) : {};
  } catch {
    raw = {};
  }
  // Tolerate stale/invalid stored values: fall back field-by-field to defaults.
  const parsed = SECTIONS[name].safeParse(raw);
  if (parsed.success) return parsed.data as Section<N>;
  const repaired = SECTIONS[name].safeParse(stripInvalid(raw, parsed.error));
  return (repaired.success ? repaired.data : SECTIONS[name].parse({})) as Section<N>;
}

function stripInvalid(raw: unknown, err: z.ZodError): Record<string, unknown> {
  const out = { ...(raw as Record<string, unknown>) };
  for (const issue of err.issues) {
    const key = issue.path[0];
    if (typeof key === "string") delete out[key];
  }
  return out;
}

/**
 * Validates a PATCH body for a section. Returns ONLY the keys the client actually sent:
 * zod fills .default() values even under .partial(), and merging those would silently reset
 * every untouched setting (v1 lost SMTP TLS exactly this way).
 */
export function parsePatch<N extends SectionName>(
  name: N,
  body: unknown,
): { ok: true; patch: Partial<Section<N>> } | { ok: false; error: string; issues: unknown } {
  const parsed = SECTIONS[name].partial().safeParse(body ?? {});
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid", issues: parsed.error.issues };
  const sent = new Set(Object.keys((body ?? {}) as object));
  const patch = Object.fromEntries(Object.entries(parsed.data).filter(([k]) => sent.has(k))) as Partial<Section<N>>;
  return { ok: true, patch };
}

export function setSection<N extends SectionName>(db: DB, name: N, patch: Partial<Section<N>>): Section<N> {
  const next = SECTIONS[name].parse({ ...getSection(db, name), ...patch }) as Section<N>;
  db.prepare(
    "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(name, JSON.stringify(next));
  return next;
}

/* ---------------------------------- API key ---------------------------------- */

export function getApiKey(db: DB): string {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'apiKey'").get() as { value: string } | undefined;
  if (row) return JSON.parse(row.value) as string;
  return regenerateApiKey(db);
}

export function regenerateApiKey(db: DB): string {
  const key = crypto.randomBytes(16).toString("hex");
  db.prepare(
    "INSERT INTO settings(key, value) VALUES('apiKey', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(JSON.stringify(key));
  return key;
}

/** Timezone actually used: Settings > General, else TZ env, else system. */
export function effectiveTimezone(db: DB): string {
  const tz = getSection(db, "general").timezone || process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
  return isValidTimezone(tz) ? tz : "UTC";
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
