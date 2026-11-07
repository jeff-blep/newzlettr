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

export interface SettingsSections {
  general: GeneralSettings;
  plex: PlexSettings;
  tautulli: TautulliSettings;
  smtp: SmtpSettings;
  images: ImagesSettings;
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

export interface ApiError {
  error: string;
  details?: unknown;
}
