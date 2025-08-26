// server/routes/tautulli.mjs
import { Router } from "express";
import { getConfig } from "../lib/config.mjs";
import { Agent as UndiciAgent, setGlobalDispatcher } from "undici";

try {
  setGlobalDispatcher(new UndiciAgent({ connect: { tls: { rejectUnauthorized: false } } }));
} catch {}

const router = Router();

function buildDispatcher(sniHost) {
  return new UndiciAgent({
    connect: { tls: { rejectUnauthorized: false, servername: sniHost || undefined } },
  });
}

async function readTautulliConfig() {
  const cfg = await getConfig();
  const t = cfg?.tautulli || {};
  const envUrl = process.env.TAUTULLI_URL || process.env.TAUTULLI_BASE_URL;
  const envKey = process.env.TAUTULLI_API_KEY || process.env.TAUTULLI_APIKEY || process.env.TAUTULLI_TOKEN;
  const url = (envUrl || t.url || "").replace(/\/+$/, "");
  const apiKey = envKey || t.apiKey || t.apikey || t.token || "";
  const hostHeader = t.hostHeader || process.env.TAUTULLI_HOST_HEADER || null;
  const sniHost = t.sniHost || process.env.TAUTULLI_SNI_HOST || null;
  return { url, apiKey, hostHeader, sniHost, raw: t };
}

async function tautulliFetch(cmd, params = {}, tcfg) {
  if (!tcfg.url || !tcfg.apiKey) throw new Error("Tautulli URL or API key missing in config");
  const usp = new URLSearchParams({
    apikey: tcfg.apiKey,
    cmd,
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  });
  const base = tcfg.url;
  const url1 = `${base}/api/v2?${usp.toString()}`;
  const headers = {};
  if (tcfg.hostHeader) headers["Host"] = String(tcfg.hostHeader);

  try {
    const r1 = await fetch(url1, {
      headers,
      dispatcher: buildDispatcher(tcfg.sniHost),
      redirect: "manual",
    });

    if ([301, 302, 307, 308].includes(r1.status)) {
      const loc = r1.headers.get("location") || "";
      const redirUrl = loc ? (loc.startsWith("http") ? loc : new URL(loc, url1).href) : null;
      if (!redirUrl) throw new Error(`Redirected with no Location header (status ${r1.status})`);
      const r2 = await fetch(redirUrl, {
        headers,
        dispatcher: buildDispatcher(tcfg.sniHost),
        redirect: "follow",
      });
      if (!r2.ok) {
        const text2 = await r2.text().catch(() => "");
        throw new Error(`HTTP ${r2.status} ${r2.statusText} ${text2 ? `- ${text2.slice(0, 200)}` : ""}`);
      }
      const j2 = await r2.json();
      return j2?.response?.data;
    }

    if (!r1.ok) {
      const text = await r1.text().catch(() => "");
      throw new Error(`HTTP ${r1.status} ${r1.statusText} ${text ? `- ${text.slice(0, 200)}` : ""}`);
    }
    const j1 = await r1.json();
    return j1?.response?.data;
  } catch (e) {
    console.error(`[tautulliFetch] ${cmd} -> ${url1} failed:`, e?.message || e);
    throw e;
  }
}

/* ---------- helpers ---------- */
function num(x) { const n = Number(x); return Number.isFinite(n) ? n : 0; }
function sumForLabel(input, wantedLabel) {
  if (!input) return 0;
  const wanted = String(wantedLabel).toLowerCase();
  if (Array.isArray(input)) {
    return input.reduce((acc, row) => {
      if (!row || typeof row !== "object") return acc;
      for (const [k, v] of Object.entries(row)) {
        if (String(k).toLowerCase() === wanted) acc += num(v);
      }
      return acc;
    }, 0);
  }
  if (typeof input === "object") {
    const buckets = [];
    if (Array.isArray(input.series)) buckets.push(...input.series);
    if (Array.isArray(input.data)) buckets.push(...input.data);
    if (buckets.length) {
      const s = buckets.find((b) => String(b?.label || b?.name || "").toLowerCase() === wanted);
      if (s && Array.isArray(s.data)) {
        return s.data.reduce((acc, point) => {
          if (point == null) return acc;
          if (typeof point === "number") return acc + point;
          if (Array.isArray(point)) return acc + num(point[1]);
          if (typeof point === "object") return acc + num(point.y ?? point.value ?? point.count);
          return acc;
        }, 0);
      }
    }
    let total = 0;
    const stack = [input];
    while (stack.length) {
      const cur = stack.pop();
      if (Array.isArray(cur)) for (const it of cur) stack.push(it);
      else if (cur && typeof cur === "object") {
        for (const [k, v] of Object.entries(cur)) {
          if (String(k).toLowerCase() === wanted) total += num(v);
          if (v && (typeof v === "object")) stack.push(v);
        }
      }
    }
    return total;
  }
  return 0;
}

/* ---------- routes ---------- */

// Generic passthrough: GET /api/tautulli?cmd=<tautulli_cmd>&...
router.get("/", async (req, res) => {
  try {
    const tcfg = await readTautulliConfig();
    const { cmd, ...rest } = req.query || {};
    if (!cmd) return res.status(400).json({ error: "Missing ?cmd=" });
    const data = await tautulliFetch(String(cmd), rest, tcfg);
    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

router.get("/_debug", async (_req, res) => {
  try {
    const tcfg = await readTautulliConfig();
    const maskedKey = tcfg.apiKey ? tcfg.apiKey.slice(0, 4) + "…" + tcfg.apiKey.slice(-4) : null;
    res.json({ tautulli: { url: tcfg.url || null, sniHost: tcfg.sniHost || null, hostHeader: tcfg.hostHeader || null, apiKey: maskedKey } });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// Clean passthrough: GET /api/tautulli/passthrough?cmd=<tautulli_cmd>&...
router.get("/passthrough", async (req, res) => {
  try {
    const tcfg = await readTautulliConfig();
    const { cmd, ...rest } = req.query || {};
    if (!cmd) return res.status(400).json({ error: "Missing ?cmd=" });
    const data = await tautulliFetch(String(cmd), rest, tcfg);
    res.json(data); // send raw Tautulli data, no wrapping
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

router.get("/home", async (req, res) => {
  try {
    const tcfg = await readTautulliConfig();
    const days = Math.max(0, parseInt(req.query.days ?? "7", 10) || 7);
    const homeStats = await tautulliFetch("get_home_stats", { time_range: days, stats_type: 0, stats_count: 25, grouping: 0 }, tcfg);
    res.json({ home: homeStats });
  } catch (e) {
    console.error("GET /tautulli/home failed:", e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

router.get("/summary", async (req, res) => {
  try {
    const tcfg = await readTautulliConfig();
    const days = Math.max(0, parseInt(req.query.days ?? "7", 10) || 7);
    const [homeStats, playsByDate, durationByDate] = await Promise.all([
      tautulliFetch("get_home_stats", { time_range: days, stats_type: 0, stats_count: 25, grouping: 0 }, tcfg),
      tautulliFetch("get_plays_by_date", { time_range: days, y_axis: "plays" }, tcfg),
      tautulliFetch("get_plays_by_date", { time_range: days, y_axis: "duration" }, tcfg),
    ]);

    const movies = sumForLabel(playsByDate, "Movies");
    const episodes = sumForLabel(playsByDate, "TV");
    const totalPlays = movies + episodes;

    const moviesSec = sumForLabel(durationByDate, "Movies");
    const tvSec = sumForLabel(durationByDate, "TV");
    const totalSeconds = moviesSec + tvSec;

    res.json({
      home: homeStats,
      totals: { movies, episodes, total_plays: totalPlays, total_time_seconds: totalSeconds },
    });
  } catch (e) {
    console.error("GET /tautulli/summary failed:", e);
    res.status(500).json({ error: "fetch failed" });
  }
});

router.get("/users", async (_req, res) => {
  try {
    const tcfg = await readTautulliConfig();
    const data = await tautulliFetch("get_users", {}, tcfg);
    const list = Array.isArray(data) ? data : (Array.isArray(data?.users) ? data.users : []);
    const out = [];
    const seen = new Set();
    for (const u of list) {
      const email = String(u?.email || "").trim();
      if (!email) continue;
      const name = String(u?.friendly_name || u?.username || u?.user || u?.name || "").trim();
      const key = email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name, email });
    }
    res.json({ users: out });
  } catch (e) {
    console.error("GET /tautulli/users failed:", e);
    res.status(500).json({ error: "fetch failed" });
  }
});

// NEW: GET /api/tautulli/recent?type=movie|episode&days=7&limit=12
router.get("/recent", async (req, res) => {
  try {
    const tcfg = await readTautulliConfig();

    const type = String(req.query.type || "").toLowerCase(); // optional: movie|episode
    const days = Math.max(1, Math.min(90, parseInt(String(req.query.days ?? "7"), 10) || 7));
    const limit = Math.max(1, Math.min(50, parseInt(String(req.query.limit ?? "12"), 10) || 12));

    const data = await tautulliFetch("get_recently_added", { time_range: days, count: limit }, tcfg);
    const rows = Array.isArray(data?.recently_added) ? data.recently_added : [];

    const filtered = type === "movie"
      ? rows.filter((r) => String(r?.media_type || r?.type || "").toLowerCase() === "movie")
      : type === "episode"
      ? rows.filter((r) => String(r?.media_type || r?.type || "").toLowerCase() === "episode")
      : rows;

    res.json({ ok: true, rows: filtered });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

export default router;
