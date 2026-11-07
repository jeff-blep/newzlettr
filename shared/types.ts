// API types shared by server and web. Keep this file dependency-free.

export type AuthMethod = "forms" | "forms-local-bypass";

export interface AuthStatus {
  /** No admin account exists yet - the UI must show first-run setup. */
  setupRequired: boolean;
  authenticated: boolean;
  username?: string;
  /** Request came from a private/LAN address and the method allows bypass. */
  localBypass: boolean;
}

export interface GeneralSettings {
  authMethod: AuthMethod;
  /** IANA zone used for schedules; "" = use the container's TZ. */
  timezone: string;
  defaultHistoryDays: number;
  logLevel: "trace" | "debug" | "info" | "warn" | "error";
  /** Public base URL of this app (used for links in emails). Optional. */
  applicationUrl: string;
}

export interface GeneralSettingsResponse extends GeneralSettings {
  apiKey: string;
  /** Timezone actually in effect after falling back to TZ/system. */
  effectiveTimezone: string;
}

export interface SystemStatus {
  version: string;
  nodeVersion: string;
  platform: string;
  arch: string;
  startedAt: string;
  uptimeSeconds: number;
  configDir: string;
  databaseFile: string;
  databaseSizeBytes: number;
  logFile: string;
  timezone: string;
  runningInDocker: boolean;
}

export interface PlexSettings {
  url: string;
  token: string; // "********" when set
  ignoreTlsErrors: boolean;
}

export interface TautulliSettings {
  url: string;
  apiKey: string; // "********" when set
  ignoreTlsErrors: boolean;
}

export interface SmtpSettings {
  host: string;
  port: number;
  encryption: "ssl" | "starttls" | "none";
  username: string;
  password: string; // "********" when set
  fromName: string;
  fromAddress: string;
  ignoreTlsErrors: boolean;
}

export interface ImagesSettings {
  mode: "embedded" | "cloudinary";
  cloudName: string;
  apiKey: string;
  apiSecret: string; // "********" when set
  folder: string;
}

export interface ContentSettings {
  headerTitle: string;
  footerText: string;
  accentColor: string;
  itemsPerCard: number;
  recentMoviesMax: number;
  recentShowsMax: number;
  episodesPerShow: number;
  excludedShows: string[];
  showSummaries: boolean;
  includeWatchLinks: boolean;
}

export interface SettingsSections {
  general: GeneralSettings;
  plex: PlexSettings;
  tautulli: TautulliSettings;
  smtp: SmtpSettings;
  images: ImagesSettings;
  content: ContentSettings;
}

/* -------------------------------- templates -------------------------------- */

export interface CardInfo {
  token: string;
  label: string;
  description: string;
}

export interface Template {
  id: number;
  name: string;
  html: string;
  updatedAt: string;
  /** Newsletters that use this template. */
  usedBy: { id: number; name: string }[];
}

export interface RenderResult {
  html: string;
  subject?: string;
  warnings: string[];
  /** Size of the final email in bytes (preview mode: approximate). */
  bytes: number;
}

export interface TestResult {
  ok: boolean;
  message: string;
  details?: Record<string, string | number | boolean>;
}

export type HealthLevel = "ok" | "warning" | "error";

export interface HealthCheck {
  source: "plex" | "tautulli" | "smtp" | "images" | "newsletters" | "sends";
  level: Exclude<HealthLevel, "ok">;
  message: string;
  /** In-app link that fixes it, e.g. /settings/connections */
  fixPath?: string;
}

export interface HealthResponse {
  checkedAt: string | null;
  checks: HealthCheck[];
}

/* ------------------------------- recipients ------------------------------- */

export interface Recipient {
  id: number;
  name: string;
  email: string;
  enabled: boolean;
  /** "tautulli" only appears on rows imported by earlier v2 builds. */
  source: "manual" | "plex" | "tautulli" | "import";
  createdAt: string;
  /** Number of newsletters that pick this recipient explicitly. */
  newsletterCount: number;
}

export interface RecipientImportResult {
  /** Plex users with access to this server. */
  found: number;
  added: number;
  updated: number;
  skippedNoEmail: number;
  /** Invited but haven't accepted yet - not imported. */
  skippedPending: number;
  alreadyPresent: number;
}

/* ------------------------------ media / stats ----------------------------- */

/** A title as shown on cards. `thumb` is a Plex-relative image path. */
export interface MediaRef {
  ratingKey?: string;
  title: string;
  subtitle?: string;
  year?: number;
  thumb?: string;
  plays?: number;
  users?: number;
  seconds?: number;
  summary?: string;
  type?: string;
  addedAt?: number;
}

export interface PlatformStat {
  name: string;
  plays: number;
  icon: string; // file name under /email-assets/platforms
}

export interface StatsResponse {
  days: number;
  library: { movies: number; shows: number; episodes: number } | null;
  window: { moviePlays: number; episodePlays: number; seconds: number } | null;
  mostWatchedMovies: MediaRef[];
  mostWatchedShows: MediaRef[];
  popularMovies: MediaRef[];
  popularShows: MediaRef[];
  platforms: PlatformStat[];
  errors: string[];
}

/* -------------------------------- host pick -------------------------------- */

export interface HostPick {
  plexItemId: string | null;
  note: string;
  updatedAt: string | null;
  item: MediaRef | null;
  /** Set when the item couldn't be loaded (deleted from Plex, Plex down). */
  itemError?: string;
}

export interface ApiError {
  error: string;
  details?: unknown;
}

/* ------------------------------- newsletters ------------------------------- */

export type SendTrigger = "scheduled" | "manual" | "test";
export type SendStatus = "running" | "sent" | "failed" | "skipped";

export interface SendRecord {
  id: number;
  newsletterId: number | null;
  newsletterName: string;
  trigger: SendTrigger;
  scheduledFor: string | null;
  status: SendStatus;
  recipientCount: number;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface Newsletter {
  id: number;
  name: string;
  subject: string;
  templateId: number | null;
  templateName: string | null;
  cron: string;
  scheduleDescription: string;
  /** null = use Settings > General default */
  historyDays: number | null;
  sendAsBcc: boolean;
  allRecipients: boolean;
  recipientIds: number[];
  /** Enabled recipients this newsletter would actually reach right now. */
  audienceCount: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  nextRuns: string[];
  lastSend: SendRecord | null;
}

export interface NewsletterInput {
  name: string;
  subject: string;
  templateId: number | null;
  cron: string;
  historyDays: number | null;
  sendAsBcc: boolean;
  allRecipients: boolean;
  recipientIds: number[];
  enabled: boolean;
}

export interface SchedulePreview {
  valid: boolean;
  error?: string;
  timezone: string;
  next: string[];
  description: string;
}
