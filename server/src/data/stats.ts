import type { MediaRef, PlatformStat, StatsResponse } from "../../../shared/types.js";
import type { DB } from "../db/index.js";
import type { HomeStat, HomeStatRow } from "../integrations/tautulli.js";
import { getSection } from "../settings.js";

import { logger } from "../logging.js";
import { plexClient, tautulliClient } from "../services.js";
import { platformIcon, platformLabel } from "./platforms.js";

const log = logger("stats");
const TTL = 5 * 60_000;
const cache = new Map<string, { at: number; value: StatsResponse }>();

function rows(stats: HomeStat[], ...ids: string[]): HomeStatRow[] {
  for (const id of ids) {
    const s = stats.find((x) => x.stat_id === id);
    if (s?.rows?.length) return s.rows;
  }
  return [];
}

export function movieRef(r: HomeStatRow): MediaRef {
  return {
    ratingKey: r.rating_key != null ? String(r.rating_key) : undefined,
    title: r.title ?? "Unknown",
    year: r.year ? Number(r.year) : undefined,
    thumb: r.thumb || undefined,
    plays: r.total_plays,
    users: r.users_watched,
    seconds: r.total_duration,
    type: "movie",
  };
}

export function showRef(r: HomeStatRow): MediaRef {
  return {
    ratingKey: r.grandparent_rating_key != null ? String(r.grandparent_rating_key) : r.rating_key != null ? String(r.rating_key) : undefined,
    title: r.grandparent_title || r.title || "Unknown",
    year: r.year ? Number(r.year) : undefined,
    thumb: r.grandparent_thumb || r.thumb || undefined,
    plays: r.total_plays,
    users: r.users_watched,
    seconds: r.total_duration,
    type: "show",
  };
}

/**
 * Removes someone's plays from a "most watched" list (matched by rating key), drops titles
 * that only they watched, and re-ranks by the remaining plays.
 */
export function subtractPlays(all: MediaRef[], theirs: MediaRef[]): MediaRef[] {
  const minus = new Map<string, number>();
  for (const t of theirs) if (t.ratingKey) minus.set(t.ratingKey, (minus.get(t.ratingKey) ?? 0) + (t.plays ?? 0));
  return all
    .map((m) => ({ ...m, plays: (m.plays ?? 0) - (m.ratingKey ? (minus.get(m.ratingKey) ?? 0) : 0) }))
    .filter((m) => m.plays > 0)
    .sort((a, b) => b.plays - a.plays);
}

/**
 * Everything the Stats page and the stats cards need for a window of `days`.
 * Partial failures are reported in `errors` instead of throwing, so one dead service
 * doesn't blank the whole page/email.
 */
export async function getStats(db: DB, days: number, opts: { fresh?: boolean; topN?: number } = {}): Promise<StatsResponse> {
  const topN = opts.topN ?? 10;
  const content = getSection(db, "content");
  // Leaving people out only changes the two "Most watched" lists - nothing else.
  const exclusionsOn = content.excludeOwnerPlays || content.excludedUserIds.length > 0;
  const key = `${days}:${topN}:${content.excludeOwnerPlays}:${content.excludedUserIds.join(",")}`;
  const hit = cache.get(key);
  if (!opts.fresh && hit && Date.now() - hit.at < TTL) return hit.value;

  const out: StatsResponse = {
    days,
    library: null,
    window: null,
    mostWatchedMovies: [],
    mostWatchedShows: [],
    popularMovies: [],
    popularShows: [],
    platforms: [],
    errors: [],
    excludedUsers: [],
  };
  const plex = plexClient(db);
  const taut = tautulliClient(db);

  await Promise.all([
    (async () => {
      if (!plex.configured) return void out.errors.push("Plex isn't configured");
      try {
        const t = await plex.libraryTotals();
        out.library = { movies: t.movies, shows: t.shows, episodes: t.episodes };
      } catch (e) {
        out.errors.push(`Plex library totals: ${(e as Error).message}`);
      }
    })(),
    (async () => {
      if (!taut.configured) return void out.errors.push("Tautulli isn't configured");
      await Promise.all([
        (async () => {
          try {
            out.window = await taut.windowTotals(days);
          } catch (e) {
            out.errors.push(`Tautulli play totals: ${(e as Error).message}`);
          }
        })(),
        (async () => {
          try {
            // Fetch deeper lists when leaving people out, so titles can move up after subtracting.
            const stats = await taut.homeStats(days, exclusionsOn ? 100 : Math.max(topN, 10));
            let topMovies = rows(stats, "top_movies").map(movieRef);
            let topShows = rows(stats, "top_tv").map(showRef);
            if (exclusionsOn) {
              const users = await taut.users();
              const excluded = new Set<number>(content.excludedUserIds);
              if (content.excludeOwnerPlays) for (const u of users) if (u.is_admin) excluded.add(Number(u.user_id));
              out.excludedUsers = users.filter((u) => excluded.has(Number(u.user_id))).map((u) => u.friendly_name || u.username);
              for (const id of excluded) {
                const theirs = await taut.homeStats(days, 100, id);
                topMovies = subtractPlays(topMovies, rows(theirs, "top_movies").map(movieRef));
                topShows = subtractPlays(topShows, rows(theirs, "top_tv").map(showRef));
              }
            }
            out.mostWatchedMovies = topMovies.slice(0, topN);
            out.mostWatchedShows = topShows.slice(0, topN);
            out.popularMovies = rows(stats, "popular_movies").map(movieRef).slice(0, topN);
            out.popularShows = rows(stats, "popular_tv").map(showRef).slice(0, topN);
            out.platforms = rows(stats, "top_platforms")
              .map((r): PlatformStat => {
                // `platform` is the display name (tvOS, Tizen); `platform_name` is Tautulli's icon key (atv, samsung).
                const display = r.platform || r.platform_name || "Other";
                const iconKey = r.platform_name || r.platform || "";
                const icon = platformIcon(iconKey);
                return { name: platformLabel(display), plays: r.total_plays ?? 0, icon: icon === "generic.png" ? platformIcon(display) : icon };
              })
              .slice(0, topN);
          } catch (e) {
            out.errors.push(`Tautulli watch stats: ${(e as Error).message}`);
          }
        })(),
      ]);
    })(),
  ]);

  if (out.errors.length) log.warn({ days, errors: out.errors }, "stats incomplete");
  cache.set(key, { at: Date.now(), value: out });
  return out;
}

export function clearStatsCache(): void {
  cache.clear();
}
