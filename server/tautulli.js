import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { fetch, Agent as UndiciAgent } from "undici";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_DIR = path.join(__dirname, "..", "config");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

// Load config (do not log secrets)
export function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return {};
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const cfg = JSON.parse(raw || "{}");
    return cfg || {};
  } catch {
    return {};
  }
}

function getTautulli() {
  const cfg = loadConfig();
  const url = cfg?.tautulli?.url || "";
  const apiKey = cfg?.tautulli?.apiKey || cfg?.tautulli?.apikey || "";
  if (!url || !apiKey) {
    const err = new Error("Tautulli not configured (need tautulli.url and tautulli.apiKey in /config/config.json).");
    err.code = "NO_TAUTULLI";
    throw err;
  }
  return { base: url.replace(/\/+$/, ""), apiKey };
}

/**
 * Call Tautulli API v2 and return `response.data`.
 * Automatically ignores self-signed certs and non-public certs.
 */
export async function tCall(cmd, params = {}) {
  const { base, apiKey } = getTautulli();

  const usp = new URLSearchParams({ apikey: apiKey, cmd });
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) usp.append(k, String(v));
  }

  const url = `${base}/api/v2?${usp.toString()}`;

  // allow self-signed certs / no SNI etc.
  const agent = new UndiciAgent({
    connect: { rejectUnauthorized: false },
  });

  const r = await fetch(url, { dispatcher: agent });
  if (!r.ok) {
    throw new Error(`Tautulli HTTP ${r.status}`);
  }
  const json = await r.json();

  // Standard Tautulli wrapper: { response: { result, data, message } }
  const resp = json?.response ?? json;
  if (!resp) throw new Error("Bad Tautulli response");
  if (resp.result !== "success") {
    throw new Error(resp.message || "Tautulli error");
  }

  return resp.data;
}
