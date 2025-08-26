// src/api.ts

type SMTPEnc = "TLS/SSL" | "STARTTLS" | "None";

// Point straight at the API in dev; use relative in prod builds.
export const API_BASE = import.meta.env.DEV ? "http://localhost:3001" : "";

function api(path: string) {
  return `${API_BASE}${path}`;
}

async function j<T = any>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(api(path), init);
  const ct = r.headers.get("content-type") || "";
  if (ct.includes("application/json")) return (await r.json()) as T;
  const text = await r.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    return { ok: false, error: text || `${r.status} ${r.statusText}` } as unknown as T;
  }
}

/** Map server fields -> UI encryption string */
function toEnc(smtpSecure?: boolean, port?: number): SMTPEnc {
  if (smtpSecure) return "TLS/SSL";
  if (port === 587) return "STARTTLS";
  if (port === 25) return "None";
  return "STARTTLS";
}

/** Map UI encryption -> server boolean */
function toSecure(enc?: SMTPEnc): boolean {
  return enc === "TLS/SSL";
}

/** ---------------- Connections: config ---------------- */
export type OwnerRecommendation = {
  plexItemId?: string | number;
  note?: string;
};

export async function getConfig() {
  // Return the server JSON as-is so callers (modal) can access imageHost/cloudinary, etc.
  return j<any>("/api/config", { cache: "no-store" } as RequestInit);
}

// helper: remove undefined keys so we don't clobber saved config on the server
function pruneUndefined(obj: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export async function postConfig(body: {
  plexUrl?: string;
  plexToken?: string;
  tautulliUrl?: string;
  tautulliApiKey?: string;

  fromAddress?: string;
  smtpEmailLogin?: string;
  smtpEmailPassword?: string; // optional: empty string won't change server-stored pass
  smtpServer?: string;
  smtpPort?: number;
  smtpEncryption?: SMTPEnc;

  lookbackDays?: number;

  imageHost?: "embedded" | "cloudinary";
  cloudinary?: {
    cloudName?: string;
    apiKey?: string;
    apiSecret?: string; // send only if user typed a new one
    folder?: string;
  };

  // NEW: allow writing ownerRecommendation to server
  ownerRecommendation?: OwnerRecommendation;
}) {
  const serverBody: any = pruneUndefined({
    // Plex / Tautulli
    plexUrl: body.plexUrl,
    plexToken: body.plexToken,
    tautulliUrl: body.tautulliUrl,
    tautulliApiKey: body.tautulliApiKey,

    // SMTP mapped to server schema
    fromAddress: body.fromAddress,
    smtpUser: body.smtpEmailLogin,
    smtpHost: body.smtpServer,
    smtpPort: body.smtpPort,
    smtpSecure: toSecure(body.smtpEncryption),

    // History lookback
    lookbackDays: body.lookbackDays,

    // Image hosting
    imageHost: body.imageHost,
  });

  if (body.cloudinary) {
    const c = pruneUndefined({
      cloudName: body.cloudinary.cloudName,
      apiKey: body.cloudinary.apiKey,
      apiSecret: body.cloudinary.apiSecret, // only include if provided by caller
      folder: body.cloudinary.folder,
    });
    if (Object.keys(c).length > 0) serverBody.cloudinary = c;
  }

  // Only send smtpPass if non-empty so we don’t clear stored value
  if (typeof body.smtpEmailPassword === "string" && body.smtpEmailPassword.length > 0) {
    serverBody.smtpPass = body.smtpEmailPassword;
  }

  return j("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(serverBody),
  });
}

/** ---------------- Connections: status for the card ---------------- */
export async function getStatus() {
  const raw = await j<any>("/api/status");
  return {
    emailOk: !!(raw.emailOk ?? raw.email ?? raw.checks?.email?.ok),
    plexOk: !!(raw.plexOk ?? raw.plex ?? raw.checks?.plex?.ok),
    tautulliOk: !!(raw.tautulliOk ?? raw.tautulli ?? raw.checks?.tautulli?.ok),
  };
}

/** ---------------- Connection tests (slashed routes) ---------------- */
export async function testPlex(body?: { plexUrl?: string; plexToken?: string }) {
  return j("/api/test/plex", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      plexUrl: body?.plexUrl,
      plexToken: body?.plexToken,
    }),
  });
}

export async function testTautulli(body?: { tautulliUrl?: string; tautulliApiKey?: string }) {
  return j("/api/test/tautulli", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tautulliUrl: body?.tautulliUrl,
      tautulliApiKey: body?.tautulliApiKey,
    }),
  });
}

export async function testSmtp(body?: {
  smtpEmailLogin?: string;
  smtpEmailPassword?: string;
  smtpServer?: string;
  smtpPort?: number;
  smtpEncryption?: SMTPEnc;
  fromAddress?: string;
  to?: string; // optional recipient for test email
}) {
  const serverBody: any = {
    smtpUser: body?.smtpEmailLogin,
    smtpHost: body?.smtpServer,
    smtpPort: body?.smtpPort,
    smtpSecure: toSecure(body?.smtpEncryption),
    fromAddress: body?.fromAddress,
    to: body?.to,
  };
  if (typeof body?.smtpEmailPassword === "string" && body.smtpEmailPassword.length > 0) {
    serverBody.smtpPass = body.smtpEmailPassword;
  }

  // Server exposes POST /api/test-email
  return j("/api/test-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(serverBody),
  });
}

/** =================== SCHEDULE =================== */
export async function getSchedule() {
  return j("/api/schedule");
}

export async function postSchedule(body: {
  dayOfWeek?: number; // 0=Sun..6=Sat
  hour?: number;      // 0..23
  minute?: number;    // 0..59
  timezone?: string;  // optional
  cron?: string;      // if your server supports cron directly
}) {
  return j("/api/schedule", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------- TAUTULLI HELPERS (via backend proxy) ----------------

type TautulliResponse<T> = {
  response: { result: "success" | "error"; data?: T; message?: string };
};

function qp(params: Record<string, any> = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    q.set(k, String(v));
  }
  return q.toString();
}

/** Low-level helper: calls our backend proxy /api/tautulli */
async function tautulli<T = any>(cmd: string, params: Record<string, any> = {}): Promise<T> {
  const qs = qp({ cmd, ...params });
  const data = await j<TautulliResponse<T>>(`/api/tautulli?${qs}`);
  if (!data || !("response" in data)) throw new Error("Bad Tautulli response");
  if (data.response.result !== "success") {
    throw new Error(data.response.message || "Tautulli error");
  }
  return data.response.data as T;
}

/** Convenient wrappers the card can call */
export async function getTautulliAppInfo() {
  return tautulli("app_info");
}

export async function getTautulliHomeStats() {
  return tautulli("get_home_stats");
}

export async function getTautulliHistory(afterEpochSeconds: number, length: number = 1000) {
  return tautulli("get_history", {
    after: afterEpochSeconds,
    length,
    order_column: "date",
    order_dir: "desc",
  });
}

/** NEW: libraries table for counts */
export async function getTautulliLibrariesTable() {
  return tautulli("get_libraries_table");
}

// at bottom of src/api.ts (or near other newsletter helpers)
export async function sendNewsletterNow(
  newsletterId: string,
  opts?: { subject?: string; homeStats?: any; lookbackDays?: number }
) {
  if (!newsletterId) throw new Error("Missing newsletter id");

  // Preserve existing payload shape; only override subject if caller provides one.
  const payload: Record<string, any> = {
    html: "<p>Test send from Newzlettr.</p>",
    // If you want to validate without sending, uncomment:
    // dryRun: true,
    // If you want to override recipients instead of using recipients.json:
    // to: "you@example.com",
    // bcc: ["a@example.com","b@example.com"],
  };
  if (opts?.subject && opts.subject.trim()) {
    payload.subject = opts.subject.trim();
  } else {
    payload.subject = "Newzlettr Newsletter"; // fallback for legacy behavior
  }
  if (opts?.homeStats) {
    // Pass Tautulli home_stats straight through so the server can render exactly what the card shows
    (payload as any).homeStats = opts.homeStats;
  }
  if (typeof opts?.lookbackDays === 'number') {
    (payload as any).lookbackDays = opts.lookbackDays;
  }

  return j(`/api/newsletters/${encodeURIComponent(newsletterId)}/send-now`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
