import type { DB } from "../db/index.js";
import type { RecentItem } from "../integrations/tautulli.js";
import { tautulliClient } from "../services.js";

export interface RecentMovie {
  ratingKey: string;
  title: string;
  year?: number;
  thumb?: string;
  summary?: string;
  genres: string[];
  contentRating?: string;
  minutes?: number;
  addedAt: number;
}

export interface RecentShow {
  ratingKey: string;
  title: string;
  thumb?: string;
  /** In season/episode order. */
  episodes: { ratingKey: string; label: string; addedAt: number; order: number }[];
  /** A whole series/season arrived rather than single episodes. */
  note?: string;
  latestAt: number;
}

interface Extra {
  summary?: string;
  genres?: string[];
  content_rating?: string;
  duration?: string | number;
}

const num = (v: unknown) => (v === undefined || v === null || v === "" ? undefined : Number(v));

export async function recentMovies(db: DB, days: number, max: number): Promise<RecentMovie[]> {
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const rows = await tautulliClient(db).recentlyAdded(since, "movie", Math.max(50, max * 4));
  const seen = new Set<string>();
  const out: RecentMovie[] = [];
  for (const r of rows as (RecentItem & Extra)[]) {
    if (r.media_type !== "movie" || seen.has(r.rating_key)) continue;
    seen.add(r.rating_key);
    out.push({
      ratingKey: r.rating_key,
      title: r.title,
      year: num(r.year),
      thumb: r.thumb || undefined,
      summary: r.summary || undefined,
      genres: Array.isArray(r.genres) ? r.genres.slice(0, 3) : [],
      contentRating: r.content_rating || undefined,
      minutes: r.duration ? Math.round(Number(r.duration) / 60000) : undefined,
      addedAt: Number(r.added_at),
    });
    if (out.length >= max) break;
  }
  return out;
}

/** Sort key so episodes read S1E1, S1E2, ... regardless of upload order. */
const epOrder = (season: unknown, episode: unknown) => (num(season) ?? 0) * 10_000 + (num(episode) ?? 0);

const epLabel = (season: unknown, episode: unknown, title: string) => {
  const s = num(season);
  const e = num(episode);
  const code = s !== undefined && e !== undefined ? `S${s}E${String(e).padStart(2, "0")}` : "";
  // Plex names untitled episodes "Episode 748" - the code already says that.
  const t = /^episode \d+$/i.test(title) ? "" : title;
  return [code, t].filter(Boolean).join(" · ") || title;
};

/**
 * Recently added TV grouped by show. Tautulli reports single episodes, whole seasons
 * (when many episodes land at once) and whole shows; seasons are expanded to episodes.
 */
export async function recentShows(
  db: DB,
  days: number,
  opts: { maxShows: number; episodesPerShow: number; excluded: string[] },
): Promise<RecentShow[]> {
  const taut = tautulliClient(db);
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const rows = await taut.recentlyAdded(since, "show", 500);
  const excluded = new Set(opts.excluded.map((s) => s.toLowerCase()));
  const shows = new Map<string, RecentShow>();

  const showFor = (key: string, title: string, thumb: string | undefined): RecentShow | null => {
    if (excluded.has(title.toLowerCase())) return null;
    let s = shows.get(key);
    if (!s) {
      s = { ratingKey: key, title, thumb, episodes: [], latestAt: 0 };
      shows.set(key, s);
    }
    if (!s.thumb && thumb) s.thumb = thumb;
    return s;
  };

  const seasonJobs: Promise<void>[] = [];
  for (const r of rows) {
    const added = Number(r.added_at);
    if (r.media_type === "episode") {
      const s = showFor(String(r.grandparent_rating_key ?? r.grandparent_title), r.grandparent_title ?? r.title, r.grandparent_thumb);
      if (!s) continue;
      s.episodes.push({
        ratingKey: r.rating_key,
        label: epLabel(r.parent_media_index, r.media_index, r.title),
        addedAt: added,
        order: epOrder(r.parent_media_index, r.media_index),
      });
      s.latestAt = Math.max(s.latestAt, added);
    } else if (r.media_type === "season") {
      const s = showFor(String(r.parent_rating_key ?? r.parent_title), r.parent_title ?? r.title, r.parent_thumb || r.thumb);
      if (!s) continue;
      s.latestAt = Math.max(s.latestAt, added);
      seasonJobs.push(
        taut
          .childrenMetadata(r.rating_key)
          .then((eps) => {
            for (const e of eps) {
              s.episodes.push({
                ratingKey: e.rating_key,
                label: epLabel(e.parent_media_index ?? r.media_index, e.media_index, e.title),
                addedAt: Number(e.added_at) || added,
                order: epOrder(e.parent_media_index ?? r.media_index, e.media_index),
              });
            }
            if (!eps.length) s.note = `${r.title} added`;
          })
          .catch(() => {
            s.note = `${r.title} added`;
          }),
      );
    } else if (r.media_type === "show") {
      const s = showFor(r.rating_key, r.title, r.thumb);
      if (!s) continue;
      s.note = "New series";
      s.latestAt = Math.max(s.latestAt, added);
    }
  }
  await Promise.all(seasonJobs);

  return [...shows.values()]
    .map((s) => {
      const seen = new Set<string>();
      s.episodes = s.episodes
        .filter((e) => !seen.has(e.ratingKey) && seen.add(e.ratingKey))
        .sort((a, b) => a.order - b.order);
      return s;
    })
    .sort((a, b) => b.latestAt - a.latestAt)
    .slice(0, opts.maxShows);
}
