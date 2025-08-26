import { readFileSync, existsSync } from "fs";
import { UndiciAgent, fetch as undiciFetch } from "undici";
import path from "path";
import url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

function loadConfig() {
  // Single source of truth: server/config.json
  const cfgPath = path.resolve(__dirname, "../config.json");
  try {
    if (!existsSync(cfgPath)) return {};
    const raw = readFileSync(cfgPath, "utf8");
    const cfg = JSON.parse(raw || "{}");
    // Support both nested and flat shapes
    const url = cfg?.tautulli?.url || cfg?.tautulliUrl || cfg?.tautulli?.baseUrl || cfg?.tautulli?.host || "";
    const apiKey = cfg?.tautulli?.apiKey || cfg?.tautulliApiKey || "";
    return { url, apiKey };
  } catch {
    return {};
  }
}

const AGENT = new UndiciAgent({
  // allow self-signed certs (Tautulli default)
  connect: { rejectUnauthorized: false },
});

export async function tCall(cmd, params = {}) {
  const { url: baseUrl, apiKey } = loadConfig();

  if (!baseUrl || !apiKey) {
    const e = new Error("Tautulli not configured (need tautulli.url and tautulli.apiKey in server/config.json).");
    e.code = "TAUTULLI_MISCONFIGURED";
    throw e;
  }

  // Build URL (CherryPy’s /api/v2)
  const u = new URL("/api/v2", baseUrl);
  u.searchParams.set("apikey", apiKey);
  u.searchParams.set("cmd", cmd);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
  }

  let res;
  try {
    res = await undiciFetch(u, { dispatcher: AGENT });
  } catch (err) {
    // surface connection resets / TLS issues clearly
    const e = new Error(`fetch failed: ${err?.message || err}`);
    e.cause = err;
    throw e;
  }

  if (!res.ok) {
    throw new Error(`Tautulli HTTP ${res.status}`);
  }

  const json = await res.json().catch(() => ({}));
  if (json?.response?.result !== "success") {
    const msg = json?.response?.message || "Tautulli API error";
    throw new Error(msg);
  }
  return json?.response?.data ?? json?.response ?? json;
}
