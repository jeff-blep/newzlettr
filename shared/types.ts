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

export interface ApiError {
  error: string;
  details?: unknown;
}
