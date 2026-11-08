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
  logLevel: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
  applicationUrl: z.string().default(""),
});

const url = z.string().trim().default("");

export const plexSchema = z.object({
  url,
  token: z.string().trim().default(""),
  ignoreTlsErrors: z.boolean().default(false),
});

export const tautulliSchema = z.object({
  url,
  apiKey: z.string().trim().default(""),
  ignoreTlsErrors: z.boolean().default(false),
});

export const smtpSchema = z.object({
  host: z.string().trim().default(""),
  port: z.number().int().min(1).max(65535).default(587),
  /** ssl = implicit TLS (465), starttls = upgrade (587), none = plaintext (25). */
  encryption: z.enum(["ssl", "starttls", "none"]).default("starttls"),
  username: z.string().trim().default(""),
  password: z.string().default(""),
  fromName: z.string().trim().default("Newzlettr"),
  fromAddress: z.string().trim().default(""),
  ignoreTlsErrors: z.boolean().default(false),
});

export const imagesSchema = z.object({
  /** embedded = inline CID attachments; cloudinary = hosted URLs. */
  mode: z.enum(["embedded", "cloudinary"]).default("embedded"),
  cloudName: z.string().trim().default(""),
  apiKey: z.string().trim().default(""),
  apiSecret: z.string().default(""),
  folder: z.string().trim().default("newzlettr"),
});

export const contentSchema = z.object({
  /** Rows in ranked cards (most watched, popular, platforms). */
  itemsPerCard: z.number().int().min(1).max(15).default(5),
  recentMoviesMax: z.number().int().min(1).max(30).default(12),
  recentShowsMax: z.number().int().min(1).max(30).default(10),
  episodesPerShow: z.number().int().min(1).max(20).default(4),
  /** Show titles never listed under recently added (e.g. daily shows). Case-insensitive. */
  excludedShows: z.array(z.string().trim().min(1)).max(200).default([]),
  showSummaries: z.boolean().default(true),
  /** Leave the server owner's plays out of the "Most watched" movie and show lists (nothing else). */
  excludeOwnerPlays: z.boolean().default(false),
  /** Tautulli user ids whose plays are also left out of the "Most watched" lists. */
  excludedUserIds: z.array(z.number().int()).max(500).default([]),
  includeWatchLinks: z.boolean().default(true),
});

/** A newsletter's look. dark/light = that design for everyone; auto = light, switching to dark where supported. */
export const EMAIL_THEMES = ["dark", "light", "auto"] as const;
export type EmailTheme = (typeof EMAIL_THEMES)[number];
export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
export interface Look {
  emailTheme: EmailTheme;
  accentColor: string;
  /** Empty = "<Plex server name> Newsletter". */
  headerTitle: string;
  footerText: string;
}
/** History window used when nothing else says otherwise (new newsletters, previews, Stats page). */
export const DEFAULT_HISTORY_DAYS = 7;

export const DEFAULT_LOOK: Look = { emailTheme: "dark", accentColor: "#7c5cff", headerTitle: "", footerText: "" };

export const SECTIONS = {
  general: generalSchema,
  plex: plexSchema,
  tautulli: tautulliSchema,
  smtp: smtpSchema,
  images: imagesSchema,
  content: contentSchema,
} as const;

/** Fields never sent to the browser in clear text. */
export const SECRET_FIELDS: { [N in SectionName]?: string[] } = {
  plex: ["token"],
  tautulli: ["apiKey"],
  smtp: ["password"],
  images: ["apiSecret"],
};
export const MASK = "********";

/** Section with secrets replaced by MASK (or "" when unset). */
export function maskSection<N extends SectionName>(name: N, value: Section<N>): Section<N> {
  const out = { ...value } as Record<string, unknown>;
  for (const f of SECRET_FIELDS[name] ?? []) out[f] = out[f] ? MASK : "";
  return out as Section<N>;
}

/** Drops MASK placeholders from a patch so "unchanged secret" keeps the stored value. */
export function unmaskPatch<N extends SectionName>(name: N, patch: Partial<Section<N>>): Partial<Section<N>> {
  const out = { ...patch } as Record<string, unknown>;
  for (const f of SECRET_FIELDS[name] ?? []) if (out[f] === MASK) delete out[f];
  return out as Partial<Section<N>>;
}

/** Draft values (possibly masked) merged over stored ones - used by "Test" before saving. */
export function resolveDraft<N extends SectionName>(db: DB, name: N, draft: unknown): Section<N> {
  const p = parsePatch(name, draft);
  const patch = p.ok ? unmaskPatch(name, p.patch) : {};
  return SECTIONS[name].parse({ ...getSection(db, name), ...patch }) as Section<N>;
}

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
