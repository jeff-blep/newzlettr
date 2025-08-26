// src/components/TautulliStatsCard.tsx
import React, { useEffect, useMemo, useState } from "react";

type Props = { days: number };
type HomeBlock = { stat_id?: string; title?: string; key?: string; rows?: any[] };

/* --------------------------- Utils & helpers ------------------------------- */

function proxiedThumb(raw?: string) {
  if (!raw) return "";
  const isUrl = /^https?:\/\//i.test(raw);
  const q = isUrl ? `u=${encodeURIComponent(raw)}` : `path=${encodeURIComponent(raw)}`;
  return `/api/plex/image?${q}`;
}

const nf0 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

function num(obj: any, keys: string[], defaultValue = 0): number {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "number" && isFinite(v)) return v;
  }
  return defaultValue;
}

// Deep path search like "totals.movie_plays"
function firstNumberByPaths(obj: any, paths: string[]): number | null {
  if (!obj || typeof obj !== "object") return null;
  for (const path of paths) {
    const parts = path.split(".");
    let cur: any = obj;
    let ok = true;
    for (const p of parts) {
      if (cur && typeof cur === "object" && p in cur) cur = cur[p];
      else { ok = false; break; }
    }
    if (ok && typeof cur === "number" && isFinite(cur)) return cur;
  }
  return null;
}

// Smarter row selector: match by stat_id or title or key (case-insensitive)
function smartPickRows(home: HomeBlock[] | undefined, candidates: string[]): any[] {
  const blocks = Array.isArray(home) ? home : [];
  if (!blocks.length) return [];
  const wanted = candidates.map((s) => String(s).toLowerCase());
  const matches = blocks.filter((b) => {
    const sid = String(b?.stat_id ?? "").toLowerCase();
    const title = String(b?.title ?? "").toLowerCase();
    const key = String(b?.key ?? "").toLowerCase();
    return wanted.some((w) => sid === w || title === w || key === w || sid.includes(w) || title.includes(w) || key.includes(w));
  });

  let rows: any[] = [];
  for (const m of matches) if (Array.isArray(m?.rows)) rows = rows.concat(m.rows);

  // Fallback heuristics
  if (!rows.length) {
    if (wanted.some(w => w.includes("popular") && w.includes("movie"))) {
      for (const b of blocks) {
        if (String(b?.stat_id).toLowerCase().includes("popular") && Array.isArray(b?.rows)) rows = rows.concat(b.rows);
      }
    }
    if (!rows.length && wanted.some(w => w.includes("movie"))) {
      for (const b of blocks) {
        if (String(b?.stat_id).toLowerCase().includes("movie") && Array.isArray(b?.rows)) rows = rows.concat(b.rows);
      }
    }
    if (!rows.length && wanted.some(w => w.includes("tv") || w.includes("show"))) {
      for (const b of blocks) {
        const sid = String(b?.stat_id).toLowerCase();
        if ((sid.includes("tv") || sid.includes("show")) && Array.isArray(b?.rows)) rows = rows.concat(b.rows);
      }
    }
    if (!rows.length && wanted.some(w => w.includes("platform") || w.includes("client"))) {
      for (const b of blocks) {
        const sid = String(b?.stat_id).toLowerCase();
        if ((sid.includes("platform") || sid.includes("client")) && Array.isArray(b?.rows)) rows = rows.concat(b.rows);
      }
    }
  }
  return rows;
}

/* ---------------- Prefer SERVER totals; fallback to rows where needed ------- */
function getTotalPlays(summary: any, home: HomeBlock[]): number {
  const totalFromServer = firstNumberByPaths(summary, [
    "totals.total_plays",
    "totals.plays",
    "total_plays",
    "plays",
    "totals.watch_count",
    "watch_count",
  ]);
  if (typeof totalFromServer === "number") return totalFromServer;

  // Fallback: sum movies + episodes from rows (approx)
  const moviesRows = smartPickRows(home, ["top_movies","most_watched_movies","movies","movie"])
    .filter((r: any) => String(r?.media_type || "").toLowerCase() === "movie");
  const tvRows = smartPickRows(home, ["top_tv","most_watched_tv_shows","most_watched_tv","tv","shows"]);
  const episodeRows = (tvRows || [])
    .filter((r: any) => String(r?.media_type || "").toLowerCase() === "episode");

  const movies = moviesRows.reduce((a: number, r: any) => a + num(r, ["total_plays","plays","play_count","count"]), 0);
  const episodes = episodeRows.reduce((a: number, r: any) => a + num(r, ["total_plays","plays","play_count","count"]), 0);
  return movies + episodes;
}

function getWatchSeconds(summary: any, home: HomeBlock[]): number | null {
  const hours = firstNumberByPaths(summary, [
    "totals.total_watch_time_hours",
    "totals.watch_time_hours",
    "totals.total_hours",
    "total_time_hours",
    "watch_time_hours",
  ]);
  if (typeof hours === "number") return Math.round(hours * 3600);

  const minutes = firstNumberByPaths(summary, [
    "totals.total_watch_time_minutes",
    "totals.watch_time_minutes",
    "totals.total_minutes",
    "total_time_minutes",
    "watch_time_minutes",
  ]);
  if (typeof minutes === "number") return Math.round(minutes * 60);

  const seconds = firstNumberByPaths(summary, [
    "totals.total_watch_time_seconds",
    "totals.watch_time_seconds",
    "totals.total_seconds",
    "total_time_seconds",
    "watch_time_seconds",
  ]);
  if (typeof seconds === "number") return seconds;

  const ambiguous = firstNumberByPaths(summary, ["totals.total_time", "total_time"]);
  if (typeof ambiguous === "number") return ambiguous > 10000 ? ambiguous : Math.round(ambiguous * 3600);

  // Fallback: sum durations from home rows
  let secSum = 0;
  for (const block of home) {
    const rows = Array.isArray(block?.rows) ? block.rows : [];
    for (const r of rows) {
      const sec = r?.total_duration ?? r?.duration_sec ?? r?.duration_seconds ?? r?.duration_s;
      const min = r?.duration_min ?? r?.duration_m ?? r?.minutes;
      if (typeof sec === "number") secSum += sec;
      else if (typeof min === "number") secSum += min * 60;
    }
  }
  return secSum || null;
}

// NEW: pull Tautulli-style type totals if backend exposes them anywhere
function getTypePlayCounts(summary: any, home: HomeBlock[]): { movies: number; episodes: number } {
  // Try common Tautulli-ish paths first
  const movies =
    firstNumberByPaths(summary, [
      "totals.movies",
      "totals.movie_plays",
      "counts.movies",
      "plays.movies",
      "media_type.movies",
      "by_type.movies",
    ]) ?? null;

  const episodes =
    firstNumberByPaths(summary, [
      "totals.episodes",
      "totals.episode_plays",
      "counts.episodes",
      "plays.episodes",
      "media_type.episodes",
      "by_type.episodes",
    ]) ?? null;

  if (movies !== null && episodes !== null) {
    return { movies, episodes };
  }

  // Fallback (approx): sum rows with explicit media_type
  const moviesRows = smartPickRows(home, ["movies","top_movies","most_watched_movies"])
    .filter((r: any) => String(r?.media_type || "").toLowerCase() === "movie");
  const tvRows = smartPickRows(home, ["tv","shows","top_tv","most_watched_tv_shows","most_watched_tv"]);
  const episodeRows = (tvRows || [])
    .filter((r: any) => String(r?.media_type || "").toLowerCase() === "episode");

  const m = moviesRows.reduce((a: number, r: any) => a + num(r, ["total_plays","plays","play_count","count"]), 0);
  const e = episodeRows.reduce((a: number, r: any) => a + num(r, ["total_plays","plays","play_count","count"]), 0);
  return { movies: m, episodes: e };
}

function formatHrsMins(totalSeconds: number | null): string {
  if (totalSeconds == null || !isFinite(totalSeconds)) return "—";
  const s = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  return `${nf0.format(hours)} Hours ${nf0.format(minutes)} Minutes`;
}

/* ---------------- Platform & Streaming Data icons -------------------------- */
const PLATFORM_ICONS: Record<string, React.ReactNode> = {
  ios: <span role="img" aria-label="iOS">📱</span>,
  android: <span role="img" aria-label="Android">🤖</span>,
  roku: <span role="img" aria-label="Roku">📺</span>,
  tvos: <span role="img" aria-label="Apple TV">🖥️</span>,
  chromecast: <span role="img" aria-label="Chromecast">📡</span>,
  web: <span role="img" aria-label="Web">🌐</span>,
};
function platformIcon(name: string) {
  const key = String(name || "").toLowerCase();
  for (const k of Object.keys(PLATFORM_ICONS)) {
    if (key === k || key.includes(k)) return PLATFORM_ICONS[k];
  }
  return <span role="img" aria-label="Device">🧩</span>;
}
const ICON_MOVIE = <span role="img" aria-label="Movie">🎬</span>;
const ICON_TV = <span role="img" aria-label="TV">📺</span>;
const ICON_TIME = <span role="img" aria-label="Time">⏱️</span>;

/* ----------------------- Short & wide tile strip --------------------------- */
type Tile = {
  badge?: React.ReactNode;
  thumb?: string;
  icon?: React.ReactNode;
  labelTop: string;
  labelMid?: string;
  labelBot?: string;
};

function TileStrip({ title, items, emptyNote }: { title: string; items: Tile[]; emptyNote?: string }) {
  return (
    <div className="rounded-xl border border-base-300 bg-base-100 shadow-sm">
      <div className="px-3 pt-2 pb-1 font-semibold text-sm">{title}</div>
      {items.length === 0 ? (
        <div className="px-3 pb-3 text-sm opacity-70">{emptyNote || "No data"}</div>
      ) : (
        <div className="px-2 pb-2 flex flex-wrap gap-2">
          {items.map((t, i) => (
            <div
              key={i}
              className="min-w-[300px] md:min-w-[360px] flex items-center gap-2 px-2 py-1.5 rounded-lg border border-base-300 bg-base-200/40 hover:bg-base-200 transition"
            >
              {t.badge !== undefined && (
                <div className="w-5 text-center text-xs opacity-70">{t.badge}</div>
              )}
              {t.thumb ? (
                <img src={t.thumb} alt="" className="w-8 h-12 object-cover rounded-md border border-base-300" />
              ) : (
                <div className="w-8 h-12 flex items-center justify-center rounded-md border border-dashed border-base-300 text-base">
                  {t.icon ?? "—"}
                </div>
              )}
              <div className="min-w-0 leading-tight">
                <div className="truncate text-sm">{t.labelTop}</div>
                {t.labelMid && <div className="truncate text-xs opacity-80">{t.labelMid}</div>}
                {t.labelBot && <div className="text-[11px] opacity-60">{t.labelBot}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Pad to exactly 6 tiles (layout consistency) -------------- */
function ensureSix<T>(items: T[], filler: (i: number) => T): T[] {
  const out = items.slice(0, 6);
  for (let i = out.length; i < 6; i++) out.push(filler(i));
  return out;
}

/* -------------------------------- Component -------------------------------- */
export default function TautulliStatsCard({ days }: Props) {
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setErr(null);
      try {
        const r = await fetch(`/api/tautulli/summary?days=${encodeURIComponent(days)}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        if (!cancelled) setSummary(j);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [days]);

  const home: HomeBlock[] = Array.isArray(summary?.home) ? summary.home : [];

  /* ---------- Source rows for lists ---------------------------------------- */
  const moviesRows = useMemo(
    () => smartPickRows(home, ["top_movies","most_watched_movies","movies","movie"]),
    [home]
  );
  const popularMoviesRows = useMemo(
    () => smartPickRows(home, ["popular_movies","movies_popular","popular"]),
    [home]
  );
  const popularShowsRows = useMemo(
    () => smartPickRows(home, ["popular_tv","popular_shows","tv_popular","shows_popular","tv"]),
    [home]
  );
  const platformsRows = useMemo(
    () => smartPickRows(home, ["top_platforms","most_used_platforms","top_clients","clients","platforms"]),
    [home]
  );

  /* ---------- Display tiles (pad to 6) ------------------------------------- */
  const listMovies = useMemo(() => {
    const items = moviesRows
      .filter((r:any) => String(r?.media_type || "").toLowerCase() === "movie" || r?.year || r?.title)
      .map((r:any) => ({
        rank: undefined as any,
        title: r?.title || r?.name || "Untitled",
        year: r?.year,
        plays: num(r, ["total_plays","plays","play_count","count"]),
        thumb: proxiedThumb(r?.thumb || r?.poster_url || r?.thumb_url),
      }))
      .sort((a,b)=>b.plays-a.plays);
    const withRank = items.map((x,i)=>({ ...x, rank: i+1 }));
    return ensureSix(
      withRank,
      (i)=>({ rank:i+1, title:"—", year:undefined, plays:0, thumb:"" } as any)
    );
  }, [moviesRows]);

  const listPopularMovies = useMemo(() => {
    const items = popularMoviesRows
      .filter((r:any)=>String(r?.media_type||"").toLowerCase()==="movie" || r?.year || r?.title)
      .map((r:any)=>({
        rank: undefined as any,
        title: r?.title || r?.name || "Untitled",
        year: r?.year,
        users: num(r, ["users_watched","unique_users","users","viewers"]),
        thumb: proxiedThumb(r?.thumb || r?.poster_url || r?.thumb_url),
      }))
      .sort((a,b)=>b.users-a.users);
    const withRank = items.map((x,i)=>({ ...x, rank: i+1 }));
    return ensureSix(
      withRank,
      (i)=>({ rank:i+1, title:"—", year:undefined, users:0, thumb:"" } as any)
    );
  }, [popularMoviesRows]);

  const listPopularShows = useMemo(() => {
    const items = popularShowsRows
      .map((r:any)=>({
        rank: undefined as any,
        title: r?.grandparent_title || r?.title || r?.name || "TV Show",
        users: num(r, ["users_watched","unique_users","users","viewers"]),
        thumb: proxiedThumb(r?.thumb || r?.poster_url || r?.thumb_url),
      }))
      .sort((a,b)=>b.users-a.users);
    const withRank = items.map((x,i)=>({ ...x, rank: i+1 }));
    return ensureSix(
      withRank,
      (i)=>({ rank:i+1, title:"—", users:0, thumb:"" } as any)
    );
  }, [popularShowsRows]);

  const listPlatforms = useMemo(() => {
    const items = platformsRows
      .map((r:any)=>({
        rank: undefined as any,
        name: r?.platform || r?.label || r?.client || "Platform",
        plays: num(r, ["total_plays","plays","play_count","count"]),
      }))
      .sort((a,b)=>b.plays-a.plays);
    const withRank = items.map((x,i)=>({ ...x, rank:i+1 }));
    return ensureSix(
      withRank,
      (i)=>({ rank:i+1, name:"—", plays:0 } as any)
    );
  }, [platformsRows]);

  /* ---------- Streaming Data (prefer Tautulli totals) ----------------------- */
  const { movies: moviesStreamed, episodes: episodesStreamed } = useMemo(
    () => getTypePlayCounts(summary, home),
    [summary, home]
  );

  const totalPlays = useMemo(() => getTotalPlays(summary, home), [summary, home]);
  const totalWatchSeconds = useMemo(() => getWatchSeconds(summary, home), [summary, home]);

  /* --------------------------------- UI ------------------------------------ */
  if (loading) {
    return (
      <div className="card bg-base-100 shadow">
        <div className="card-body">
          <span className="loading loading-spinner loading-sm" /> Loading Plex Media Server Data…
        </div>
      </div>
    );
  }
  if (err) {
    return (
      <div className="card bg-base-100 shadow">
        <div className="card-body">
          <div className="alert alert-error">Failed to load: {err}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="card bg-base-100 shadow">
      <div className="card-body">
        {/* Tight counters at top from SERVER totals */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Stat label="Total Plays" value={nf0.format(totalPlays)} />
          <Stat label="Total Watch Time" value={formatHrsMins(totalWatchSeconds)} />
        </div>

        {/* Short & wide strips */}
        <div className="mt-3 grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-3">
          <TileStrip
            title="Streaming Data"
            items={[
              { icon: ICON_MOVIE, labelTop: "Movies Streamed",  labelMid: nf0.format(moviesStreamed) },
              { icon: ICON_TV,    labelTop: "TV Episodes Streamed", labelMid: nf0.format(episodesStreamed) },
              { icon: ICON_TIME,  labelTop: "Total Hours Streamed", labelMid: formatHrsMins(totalWatchSeconds) },
            ]}
          />

          <TileStrip
            title="Most Watched Movies"
            items={listMovies.map(x=>({
              badge:x.rank,
              thumb:x.thumb,
              labelTop: x.year ? `${x.title} (${x.year})` : x.title,
              labelMid: `${x.plays} plays`,
            }))}
          />
          <TileStrip
            title="Most Popular Movies"
            items={listPopularMovies.map(x=>({
              badge:x.rank,
              thumb:x.thumb,
              labelTop: x.year ? `${x.title} (${x.year})` : x.title,
              labelMid: `${x.users} viewers`,
            }))}
          />
          <TileStrip
            title="Most Popular TV Shows"
            items={listPopularShows.map(x=>({
              badge:x.rank,
              thumb:x.thumb,
              labelTop: x.title,
              labelMid: `${x.users} viewers`,
            }))}
          />
          <TileStrip
            title="Most Used Platforms"
            items={listPlatforms.map(x=>({
              badge:x.rank,
              icon: platformIcon(x.name),
              labelTop: x.name,
              labelMid: `${x.plays} plays`,
            }))}
          />
        </div>

        {/* Placeholder parity (kept minimal) */}
        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
          <TileStrip title="Recently added Movies" items={[]} emptyNote="Shown in email when sending." />
          <TileStrip title="Recently added TV Episodes" items={[]} emptyNote="Shown in email when sending." />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-base-300 bg-base-200 px-3 py-2">
      <div className="text-xs opacity-70">{label}</div>
      <div className="text-base font-semibold">{value}</div>
    </div>
  );
}
