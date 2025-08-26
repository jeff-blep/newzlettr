/* server/routes/plex.mjs */
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/* dirname */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* config helpers */
const CONFIG_PATH = path.join(__dirname, "..", "config.json");
function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")); } catch { return {}; }
}
function trimRightSlash(u = "") { return String(u || "").replace(/\/+$/, ""); }
function okStr(s) { return typeof s === "string" && s.trim().length > 0; }

function getPlexConfig() {
  const cfg = readConfig();
  const nested = cfg?.plex || {};
  const envUrl = process.env.PLEX_URL || process.env.PLEX_BASE_URL;
  const envToken = process.env.PLEX_TOKEN || process.env.PLEX_AUTH_TOKEN;
  const flatUrl = cfg?.plexUrl || cfg?.plexBaseUrl;
  const flatToken = cfg?.plexToken || cfg?.plexAuthToken;
  const base = trimRightSlash(envUrl || nested.url || nested.baseUrl || flatUrl || "");
  const token = String(envToken || nested.token || nested.authToken || flatToken || "");
  return { base, token };
}

/* fetch helpers */
async function fetchWithTimeout(url, opts = {}, ms = 8000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ac.signal }); }
  finally { clearTimeout(t); }
}
function plexUrl(base, token, rel, qp = {}) {
  const u = new URL(rel, trimRightSlash(base) + "/");
  u.searchParams.set("X-Plex-Token", token);
  for (const [k, v] of Object.entries(qp)) if (v != null) u.searchParams.set(k, String(v));
  return u.toString();
}

const router = express.Router();

/* ------- SEARCH ------- */
/** GET /api/plex/search?q=… */
router.get("/search", async (req, res) => {
  const { base, token } = getPlexConfig();
  const q = String(req.query.q || "").trim();
  if (!okStr(base) || !okStr(token) || q.length < 2) return res.json({ results: [] });

  try {
    const headers = { Accept: "application/json" };
    // prefer hubs
    let url = plexUrl(base, token, "/hubs/search", { query: q, "X-Plex-Container-Start": 0, "X-Plex-Container-Size": 30 });
    let r = await fetchWithTimeout(url, { headers }, 8000);
    let text = await r.text();
    let data = r.ok ? JSON.parse(text) : null;

    if (!data?.MediaContainer) {
      url = plexUrl(base, token, "/search", { query: q, "X-Plex-Container-Start": 0, "X-Plex-Container-Size": 30 });
      r = await fetchWithTimeout(url, { headers }, 8000);
      text = await r.text();
      data = r.ok ? JSON.parse(text) : null;
    }

    const hubs = data?.MediaContainer?.Hub || [];
    const fromHubs = [];
    for (const hub of hubs) {
      const meta = Array.isArray(hub?.Metadata) ? hub.Metadata : [];
      for (const m of meta) fromHubs.push(m);
    }
    const plain = Array.isArray(data?.MediaContainer?.Metadata) ? data.MediaContainer.Metadata : [];
    const merged = fromHubs.length ? fromHubs : plain;

    const results = merged.map((m) => ({
      ratingKey: m.ratingKey ?? m.key ?? m.guid ?? "",
      title: m.title ?? m.grandparentTitle ?? m.parentTitle ?? "",
      type: m.type ?? m.librarySectionType ?? "",
      year: m.year,
      grandparentThumb: m.grandparentThumb, parentThumb: m.parentThumb, thumb: m.thumb, art: m.art,
      grandparent_title: m.grandparentTitle, parent_title: m.parentTitle,
    }));
    res.json({ results });
  } catch (e) {
    console.error("[plex.search]", e?.message || e);
    res.json({ results: [] });
  }
});

/* ------- ITEM ------- */
/** GET /api/plex/item/:id */
router.get("/item/:id", async (req, res) => {
  const { base, token } = getPlexConfig();
  const id = String(req.params.id || "").trim();
  if (!okStr(base) || !okStr(token) || !okStr(id)) return res.json({ item: null });
  try {
    const r = await fetchWithTimeout(plexUrl(base, token, `/library/metadata/${encodeURIComponent(id)}`), { headers: { Accept: "application/json" } }, 8000);
    if (!r.ok) return res.json({ item: null });
    const j = await r.json().catch(async () => JSON.parse(await r.text()));
    const item = j?.MediaContainer?.Metadata?.[0] ?? null;
    res.json({ item });
  } catch (e) {
    console.error("[plex.item]", e?.message || e);
    res.json({ item: null });
  }
});

/* ------- IMAGE PROXY ------- */
/** GET /api/plex/image?path=/library/...  OR  ?u=http(s)://... */
router.get("/image", async (req, res) => {
  try {
    const { base, token } = getPlexConfig();
    if (!okStr(base) || !okStr(token)) return res.status(400).send("Missing Plex config");
    const rel = req.query?.path; const u = req.query?.u;
    let url;
    if (rel) url = plexUrl(base, token, String(rel));
    else if (u) url = String(u);
    else return res.status(400).send("Missing 'path' or 'u'");

    const r = await fetchWithTimeout(url, {}, 8000);
    if (!r.ok) return res.status(r.status).send(await r.text());
    res.set("Content-Type", r.headers.get("content-type") || "image/jpeg");
    const buf = Buffer.from(await r.arrayBuffer());
    res.end(buf);
  } catch (e) {
    console.error("[plex.image]", e?.message || e);
    res.status(500).send("Image proxy error");
  }
});

/* ------- IDENTITY ------- */
/** GET /api/plex/identity -> { machineIdentifier, friendlyName } */
router.get("/identity", async (_req, res) => {
  const { base, token } = getPlexConfig();
  if (!okStr(base) || !okStr(token)) return res.status(400).json({ error: "Missing Plex config" });
  try {
    const r = await fetchWithTimeout(plexUrl(base, token, "/identity"), {}, 6000);
    const text = await r.text();
    if (!r.ok) return res.status(r.status).send(text);
    const id = text.match(/machineIdentifier="([^"]+)"/i)?.[1] || null;
    const name = text.match(/friendlyName="([^"]+)"/i)?.[1] || null;
    if (!id) return res.status(500).json({ error: "Unable to parse machineIdentifier" });
    res.json({ machineIdentifier: id, friendlyName: name });
  } catch (e) {
    console.error("[plex.identity]", e?.message || e);
    res.status(500).json({ error: String(e) });
  }
});

/** GET /api/plex/server-id -> { machineIdentifier } */
router.get("/server-id", async (_req, res) => {
  const { base, token } = getPlexConfig();
  if (!okStr(base) || !okStr(token)) return res.status(400).json({ error: "Missing Plex config" });
  try {
    const r = await fetchWithTimeout(plexUrl(base, token, "/identity"), {}, 6000);
    const text = await r.text();
    if (!r.ok) return res.status(r.status).send(text);
    const id = text.match(/machineIdentifier="([^"]+)"/i)?.[1] || null;
    if (!id) return res.status(500).json({ error: "Unable to parse machineIdentifier" });
    res.json({ machineIdentifier: id });
  } catch (e) {
    console.error("[plex.server-id]", e?.message || e);
    res.status(500).json({ error: String(e) });
  }
});

export default router;
