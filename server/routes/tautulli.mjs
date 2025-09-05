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

  // Prefer nested block but support flat keys and ENV variables
  const nested = cfg?.tautulli || {};
  const envUrl = process.env.TAUTULLI_URL || process.env.TAUTULLI_BASE_URL;
  const envKey = process.env.TAUTULLI_API_KEY || process.env.TAUTULLI_APIKEY || process.env.TAUTULLI_TOKEN;

  // Flat key variants some setups provide
  const flatUrl = cfg?.tautulliUrl || cfg?.tautulliBaseUrl;
  const flatKey = cfg?.tautulliApiKey || cfg?.tautulliKey;

  const url = String(envUrl || nested.url || nested.baseUrl || flatUrl || "").replace(/\/+$/, "");
  const apiKey = String(envKey || nested.apiKey || nested.apikey || nested.token || flatKey || "");

  const hostHeader = nested.hostHeader || process.env.TAUTULLI_HOST_HEADER || null;
  const sniHost = nested.sniHost || process.env.TAUTULLI_SNI_HOST || null;

  return { url, apiKey, hostHeader, sniHost, raw: nested };
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
    const limit = Math.max(1, Math.min(500, parseInt(String(req.query.limit ?? "12"), 10) || 12));

    const data = await tautulliFetch("get_recently_added", { time_range: days, count: limit }, tcfg);
    const rows = Array.isArray(data?.recently_added) ? data.recently_added : [];

    // Normalize TV rows so downstream can always key on grandparent_title
    const norm = rows.map((r) => {
      const t = String(r?.media_type || r?.type || "").toLowerCase();
      if (t === "season") {
        const gp = (r?.grandparent_title ?? "").trim();
        const parent = (r?.parent_title ?? "").trim();
        if (!gp && parent) {
          return { ...r, grandparent_title: parent };
        }
      } else if (t === "show") {
        const title = (r?.title ?? "").trim();
        if (title) {
          return { ...r, grandparent_title: title };
        }
      }
      return r;
    });

    // Enforce time window locally using added_at (seconds)
    const nowSec = Math.floor(Date.now() / 1000);
    const cutoff = nowSec - days * 24 * 60 * 60;
    const inWindow = norm.filter((r) => {
      const ts = Number(r?.added_at ?? r?.addedAt ?? r?.created_at ?? 0);
      // allow small clock skew (+1h)
      return Number.isFinite(ts) && ts >= cutoff && ts <= nowSec + 3600;
    });

    const filtered = type === "movie"
      ? inWindow.filter((r) => String(r?.media_type || r?.type || "").toLowerCase() === "movie")
      : type === "episode"
      ? inWindow.filter((r) => String(r?.media_type || r?.type || "").toLowerCase() === "episode")
      : inWindow;

    // Sort newest-first using added_at (fallbacks supported)
    const rowsSorted = filtered.slice().sort((a, b) => {
      const ta = Number(a?.added_at ?? a?.addedAt ?? a?.created_at ?? 0);
      const tb = Number(b?.added_at ?? b?.addedAt ?? b?.created_at ?? 0);
      return tb - ta;
    });
    // Enforce a post-filter cap to avoid huge previews. For TV and movies, keep it modest.
    const effectiveLimit = (type === "episode" || type === "movie") ? Math.min(limit, 25) : limit;
    const limited = rowsSorted.slice(0, effectiveLimit);
    res.json({ ok: true, rows: limited });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

export default router;
