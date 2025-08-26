/* server/index.mjs */
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";
import { fileURLToPath } from "url";

/* ---------------------- helper: dynamic router loader ---------------------- */
async function loadRouter(modUrl, name) {
  try {
    const mod = await import(modUrl);
    const candidates = [
      mod.default,
      mod.router,
      mod.routes,
      mod[name],            // e.g., plex, tautulli
      typeof mod.createRouter === "function" ? mod.createRouter() : undefined,
    ];
    const router = candidates.find(
      (r) => r && typeof r === "function" && typeof r.use === "function" && typeof r.get === "function"
    );
    if (!router) {
      console.error(`[router] ${name}: no usable router export found`, {
        hasDefault: !!mod.default,
        hasRouter: !!mod.router,
        hasRoutes: !!mod.routes,
        hasNamed: !!mod[name],
        hasCreateRouter: typeof mod.createRouter === "function",
        keys: Object.keys(mod || {}),
      });
    } else {
      console.log(`[router] ${name}: loaded OK`);
    }
    return router;
  } catch (e) {
    console.error(`[router] ${name}: failed to import`, e?.message || e);
    return undefined;
  }
}

/* ---------------------------- ESM dirname utils --------------------------- */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ------------------------------- config I/O -------------------------------- */
const CONFIG_PATH = path.join(__dirname, "config.json");
const DEFAULT_CONFIG = {
  smtpHost: "",
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: "",
  smtpPass: "",
  fromAddress: "",
  plexUrl: "",
  plexToken: "",
  tautulliUrl: "",
  tautulliApiKey: "",
  lookbackDays: 7,
  ownerRecommendation: {},
  lastTest: { plex: "unknown", tautulli: "unknown", smtp: "unknown" },
};

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      lastTest: { ...DEFAULT_CONFIG.lastTest, ...(parsed.lastTest || {}) },
      lookbackDays: typeof parsed.lookbackDays === "number" ? parsed.lookbackDays : 7,
      ownerRecommendation: parsed.ownerRecommendation || {},
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}
function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf8");
}
let CONFIG = loadConfig();

/* --------------------------- recipients persistence ------------------------ */
const RECIPIENTS_PATH = path.join(__dirname, "recipients.json");

function loadRecipientsSafe() {
  try {
    if (!fs.existsSync(RECIPIENTS_PATH)) {
      fs.writeFileSync(RECIPIENTS_PATH, "[]", "utf8");
    }
    const txt = fs.readFileSync(RECIPIENTS_PATH, "utf8");
    const arr = JSON.parse(txt);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    console.error("[recipients] load failed:", e?.message || e);
    return [];
  }
}
function saveRecipientsSafe(list) {
  try {
    fs.writeFileSync(RECIPIENTS_PATH, JSON.stringify(list, null, 2), "utf8");
    console.log("[recipients] wrote", RECIPIENTS_PATH);
    return true;
  } catch (e) {
    console.error("[recipients] write failed:", e?.message || e);
    return false;
  }
}
function isEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());
}

/* -------------------------------- helpers --------------------------------- */
function applyIncomingSmtp(body, cfg) {
  if (typeof body.smtpHost === "string") cfg.smtpHost = body.smtpHost;
  if (typeof body.smtpPort === "number") cfg.smtpPort = body.smtpPort;
  if (typeof body.smtpSecure === "boolean") cfg.smtpSecure = body.smtpSecure;
  if (typeof body.smtpUser === "string") cfg.smtpUser = body.smtpUser;
  if (typeof body.smtpPass === "string" && body.smtpPass.length > 0) cfg.smtpPass = body.smtpPass;
  if (typeof body.fromAddress === "string") cfg.fromAddress = body.fromAddress;

  if (typeof body.smtpServer === "string") cfg.smtpHost = body.smtpServer;
  if (typeof body.smtpPort === "number") cfg.smtpPort = body.smtpPort;
  if (typeof body.smtpEmailLogin === "string") cfg.smtpUser = body.smtpEmailLogin;
  if (typeof body.smtpEmailPassword === "string" && body.smtpEmailPassword.length > 0)
    cfg.smtpPass = body.smtpEmailPassword;
  if (typeof body.smtpEncryption === "string")
    cfg.smtpSecure = body.smtpEncryption.toUpperCase() === "TLS/SSL";
}
function smtpTransportOptions(cfg) {
  const secure = !!cfg.smtpSecure;
  return {
    host: cfg.smtpHost,
    port: Number(cfg.smtpPort) || (secure ? 465 : 587),
    secure,
    requireTLS: !secure && Number(cfg.smtpPort) === 587,
    ignoreTLS: !secure && Number(cfg.smtpPort) === 25,
    auth: cfg.smtpUser ? { user: cfg.smtpUser, pass: cfg.smtpPass } : undefined,
  };
}

/* --------------------------------- app ------------------------------------ */
const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());
app.get("/__whoami", (_req, res) => res.json({ file: __filename, configPath: CONFIG_PATH, recipientsPath: RECIPIENTS_PATH }));

/* --------------------------- mount feature routers ------------------------- */
const plexRouter = await loadRouter(new URL("./routes/plex.mjs", import.meta.url), "plex");
const tautulliRouter = await loadRouter(new URL("./routes/tautulli.mjs", import.meta.url), "tautulli");

if (plexRouter) app.use("/api/plex", plexRouter);
if (tautulliRouter) app.use("/api/tautulli", tautulliRouter);

/* -------------------------- tiny debug observability ----------------------- */
app.get("/api/_routes", (_req, res) => {
  const stack = (app._router && app._router.stack) || [];
  const routes = [];
  for (const layer of stack) {
    if (layer.route && layer.route.path) {
      const methods = Object.keys(layer.route.methods || {}).filter(Boolean);
      routes.push({ path: layer.route.path, methods });
    } else if (layer.name === "router" && layer.regexp) {
      routes.push({ mounted: true, path: String(layer.regexp) });
    }
  }
  res.json({ routes });
});

// simple placeholder so the UI stops 404'ing until schedule is implemented
app.get("/api/schedule", (_req, res) => {
  res.json({ jobs: [] });
});

/* --------------------- recipients API (NEW — persistent) ------------------- */
// GET list of recipients
app.get("/api/recipients", (_req, res) => {
  res.json(loadRecipientsSafe());
});
// POST full replacement list
app.post("/api/recipients", (req, res) => {
  const payload = Array.isArray(req.body) ? req.body : [];
  const cleaned = payload
    .map((r) => ({
      fullName: String(r?.fullName || r?.name || "").trim(),
      email: String(r?.email || "").trim().toLowerCase(),
    }))
    .filter((r) => isEmail(r.email))
    // de-dup by email
    .reduce((acc, r) => (acc.find(x => x.email === r.email) ? acc : acc.concat(r)), []);

  if (!saveRecipientsSafe(cleaned)) {
    return res.status(500).json({ ok: false, error: "Failed to write recipients.json" });
  }
  res.json({ ok: true, recipients: cleaned });
});

/* -------------------------------- API routes ------------------------------ */
app.get("/api/config", (_req, res) => {
  const { smtpPass, ...rest } = CONFIG;
  res.json(rest);
});
app.post("/api/config", (req, res) => {
  const b = req.body || {};
  if (typeof b.plexUrl === "string") CONFIG.plexUrl = b.plexUrl;
  if (typeof b.plexToken === "string") CONFIG.plexToken = b.plexToken;
  if (typeof b.tautulliUrl === "string") CONFIG.tautulliUrl = b.tautulliUrl;
  if (typeof b.tautulliApiKey === "string") CONFIG.tautulliApiKey = b.tautulliApiKey;
  if (typeof b.lookbackDays === "number") CONFIG.lookbackDays = b.lookbackDays;
  if (b.ownerRecommendation && typeof b.ownerRecommendation === "object") {
    CONFIG.ownerRecommendation = b.ownerRecommendation;
  }
  applyIncomingSmtp(b, CONFIG);
  saveConfig(CONFIG);
  res.json({ ok: true });
});
app.get("/api/status", (_req, res) => {
  const s = CONFIG.lastTest || {};
  res.json({ emailOk: s.smtp === "ok", plexOk: s.plex === "ok", tautulliOk: s.tautulli === "ok" });
});
app.post("/api/test/plex", async (req, res) => {
  const plexUrl = (req.body && req.body.plexUrl) || CONFIG.plexUrl;
  const plexToken = (req.body && req.body.plexToken) || CONFIG.plexToken;
  try {
    if (!plexUrl || !plexToken) throw new Error("Missing plexUrl or plexToken");
    const urlWithScheme = /^https?:\/\//i.test(plexUrl) ? plexUrl : `http://${plexUrl}`;
    const sep = urlWithScheme.includes("?") ? "&" : "?";
    const probe = `${urlWithScheme}${sep}X-Plex-Token=${encodeURIComponent(plexToken)}`;
    const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), 5000);
    let r; try { r = await fetch(probe, { method: "GET", signal: ac.signal }); } finally { clearTimeout(timer); }
    if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
    CONFIG.lastTest.plex = "ok"; saveConfig(CONFIG); res.json({ ok: true });
  } catch (e) { CONFIG.lastTest.plex = "fail"; saveConfig(CONFIG); res.json({ ok: false, error: e?.message || String(e) }); }
});
app.post("/api/test-plex", (req, res) =>
  app._router.handle({ ...req, url: "/api/test/plex", method: "POST" }, res, () => {})
);
app.post("/api/test/tautulli", async (req, res) => {
  const tUrlRaw = (req.body && req.body.tautulliUrl) || CONFIG.tautulliUrl;
  const apiKey = (req.body && req.body.tautulliApiKey) || CONFIG.tautulliApiKey;
  try {
    if (!tUrlRaw || !apiKey) throw new Error("Missing tautulliUrl or tautulliApiKey");
    const tUrl = /^https?:\/\//i.test(tUrlRaw) ? tUrlRaw : `http://${tUrlRaw}`;
    const base = `${tUrl}`.replace(/\/+$/, "");
    const probe = `${base}/api/v2?apikey=${encodeURIComponent(apiKey)}&cmd=get_activity`;
    const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), 5000);
    let r; try { r = await fetch(probe, { method: "GET", signal: ac.signal }); } finally { clearTimeout(timer); }
    if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
    const json = await r.json().catch(() => null);
    const ok = json && json.response && json.response.result === "success";
    if (!ok) throw new Error("Unexpected response from Tautulli");
    CONFIG.lastTest.tautulli = "ok"; saveConfig(CONFIG); res.json({ ok: true });
  } catch (e) { CONFIG.lastTest.tautulli = "fail"; saveConfig(CONFIG); res.json({ ok: false, error: e?.message || String(e) }); }
});
app.post("/api/test-tautulli", (req, res) =>
  app._router.handle({ ...req, url: "/api/test/tautulli", method: "POST" }, res, () => {})
);
app.post("/api/test-email", async (req, res) => {
  const merged = { ...CONFIG }; applyIncomingSmtp(req.body || {}, merged);
  try {
    if (!merged.smtpHost || !merged.smtpPort) throw new Error("Missing SMTP server/port");
    if (!merged.fromAddress) throw new Error("Missing From Address");
    const transport = nodemailer.createTransport(smtpTransportOptions(merged));
    await transport.verify();
    if (req.body && typeof req.body.to === "string" && req.body.to.length > 0) {
      await transport.sendMail({
        from: merged.fromAddress, to: req.body.to,
        subject: "Newzlettr SMTP Test",
        text: "This is a test email confirming your SMTP settings are working.",
      });
    }
    applyIncomingSmtp(req.body || {}, CONFIG);
    CONFIG.lastTest.smtp = "ok"; saveConfig(CONFIG);
    res.json({ ok: true });
  } catch (e) { CONFIG.lastTest.smtp = "fail"; saveConfig(CONFIG); res.json({ ok: false, error: e?.message || String(e) }); }
});
app.post("/api/test/smtp", (req, res) =>
  app._router.handle({ ...req, url: "/api/test-email", method: "POST" }, res, () => {})
);
/* ----------------------- send-now: blast a newsletter ---------------------- */
/**
 * POST /api/newsletters/:id/send-now
 * Body (flexible; all optional except content):
 * {
 *   subject?: string,               // default: "Newsletter"
 *   html?: string,                  // preferred; raw HTML of the email
 *   text?: string,                  // fallback text if no html
 *   to?: string[] | string,         // override recipients; can be a single string or array
 *   bcc?: string[] | string,        // optional BCC override
 *   dryRun?: boolean                // if true, don't actually send; just validate & return summary
 * }
 *
 * If no `to` or `bcc` provided, the route will load ./recipients.json and send one message
 * with BCC to everyone (and a harmless "To: Undisclosed recipients").
 */
app.post("/api/newsletters/:id/send-now", async (req, res) => {
  try {
    const id = req.params.id || "unknown";
    const body = req.body || {};

    // --- 1) Validate SMTP config
    if (!CONFIG.smtpHost || !CONFIG.smtpPort || !CONFIG.fromAddress) {
      return res.status(400).json({
        ok: false,
        error: "SMTP is not configured (smtpHost, smtpPort, fromAddress are required). Set them in /api/config.",
      });
    }

    // --- 2) Determine recipients
    let toList = [];
    let bccList = [];

    const normalizeList = (v) =>
      (Array.isArray(v) ? v : (typeof v === "string" ? v.split(",") : []))
        .map((s) => String(s || "").trim().toLowerCase())
        .filter((s) => s.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));

    if (body.to) toList = normalizeList(body.to);
    if (body.bcc) bccList = normalizeList(body.bcc);

    if (toList.length === 0 && bccList.length === 0) {
      // load recipients.json as default BCC list
      const saved = loadRecipientsSafe();
      bccList = saved.map((r) => String(r.email || "").trim().toLowerCase())
                     .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
    }

    if (toList.length === 0 && bccList.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "No recipients found (none provided and recipients.json is empty).",
      });
    }

    // --- 3) Build content
    const subject = String(body.subject || "Newsletter").trim();
    const hasHtml = typeof body.html === "string" && body.html.trim().length > 0;
    const hasText = typeof body.text === "string" && body.text.trim().length > 0;

    if (!hasHtml && !hasText) {
      return res.status(400).json({
        ok: false,
        error: "No email content provided. Include `html` and/or `text` in the request body.",
      });
    }

    // --- 4) Transport
    const transport = nodemailer.createTransport(smtpTransportOptions(CONFIG));

    // Optionally verify before send (clearer SMTP errors)
    try {
      await transport.verify();
    } catch (e) {
      return res.status(400).json({
        ok: false,
        error: `SMTP verification failed: ${e?.message || e}`,
      });
    }

    // --- 5) Prepare message
    const msg = {
      from: CONFIG.fromAddress,
      to: toList.length > 0 ? toList.join(", ") : "Undisclosed Recipients",
      bcc: bccList.length > 0 ? bccList.join(", ") : undefined,
      subject,
      ...(hasHtml ? { html: body.html } : {}),
      ...(hasText ? { text: body.text } : {}),
      headers: { "X-Newzlettr-Newsletter-ID": id },
    };

    // --- 6) Dry run / send
    if (body.dryRun) {
      return res.json({
        ok: true,
        dryRun: true,
        summary: { id, toCount: toList.length, bccCount: bccList.length, subject, hasHtml, hasText },
      });
    }

    const info = await transport.sendMail(msg);

    return res.json({
      ok: true,
      id,
      accepted: info.accepted || [],
      rejected: info.rejected || [],
      envelope: info.envelope || {},
      messageId: info.messageId || null,
      response: info.response || null,
      toCount: toList.length,
      bccCount: bccList.length,
    });
  } catch (e) {
    console.error("[send-now] error:", e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});
/* --------------------------------- start ---------------------------------- */
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
  console.log(`config.json -> ${CONFIG_PATH}`);
  console.log(`recipients.json -> ${RECIPIENTS_PATH}`);
});
