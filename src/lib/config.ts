type Keys =
  | "plexUrl" | "plexToken"
  | "tautulliUrl" | "tautulliKey"
  | "respectLibraryShares"
  | "smtpHost" | "smtpPort" | "smtpMode" | "smtpUser" | "smtpPass" | "smtpFrom";

const STORAGE_KEY = "plex-newsletter-config-v1";

export type AppConfig = Record<Keys, string | boolean>;

// Note: we now use smtpMode: "starttls" | "ssl"
const DEFAULTS: AppConfig = {
  plexUrl: "",
  plexToken: "",
  tautulliUrl: "",
  tautulliKey: "",
  respectLibraryShares: true,

  smtpHost: "",
  smtpPort: "587",
  smtpMode: "starttls", // "starttls" (587) or "ssl" (465)
  smtpUser: "",
  smtpPass: "",
  smtpFrom: "",
};

export function loadConfig(): AppConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);

    // Back-compat: migrate old smtpSecure true/false to smtpMode
    let smtpMode = parsed.smtpMode;
    if (!smtpMode && typeof parsed.smtpSecure !== "undefined") {
      smtpMode = String(parsed.smtpSecure) === "true" ? "ssl" : "starttls";
    }

    return { ...DEFAULTS, ...parsed, ...(smtpMode ? { smtpMode } : {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveConfig(cfg: AppConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    /* ignore storage errors */
  }
}
