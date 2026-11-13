import { XMLParser } from "fast-xml-parser";
import type { Section } from "../settings.js";
import { logger } from "../logging.js";
import { HttpError, httpFetch, httpJson, normalizeBaseUrl } from "./http.js";

const log = logger("plex");

export interface PlexItem {
  ratingKey: string;
  key?: string;
  type: string; // movie | show | season | episode
  title: string;
  year?: number;
  summary?: string;
  thumb?: string;
  art?: string;
  grandparentTitle?: string;
  grandparentThumb?: string;
  grandparentRatingKey?: string;
  parentRatingKey?: string;
  parentTitle?: string;
  /** Episodes in a show/season. */
  leafCount?: number;
  parentIndex?: number;
  index?: number;
  addedAt?: number;
  originallyAvailableAt?: string;
  contentRating?: string;
  duration?: number;
  rating?: number;
  audienceRating?: number;
  Genre?: { tag: string }[];
  librarySectionTitle?: string;
}

export interface PlexSharedUser {
  userId: string;
  username: string;
  title: string;
  email: string;
  /** Invited but hasn't accepted yet. */
  pending: boolean;
  /** Titles of the libraries switched on for this person (empty = friend with no libraries). */
  libraries: string[];
  allLibraries: boolean;
}

export interface LibraryTotals {
  movies: number;
  shows: number;
  episodes: number;
  sections: PlexSection[];
}

export interface PlexSection {
  key: string;
  title: string;
  /** movie | show | artist | photo — Plex reports "Other Videos" libraries as "movie" too. */
  type: string;
  agent?: string;
}

/**
 * Only libraries created as Plex's "Movies" or "TV Shows" category count toward the totals.
 * "Other Videos" (home videos, DVR recordings, …) shares type "movie"/"show" but uses the
 * no-metadata agent (tv.plex.agents.none, legacy com.plexapp.agents.none), so that's the tell.
 */
export function countedKind(s: PlexSection): "movie" | "show" | null {
  if (s.agent && /\.none$/i.test(s.agent)) return null;
  return s.type === "movie" || s.type === "show" ? s.type : null;
}

type MC<T> = { MediaContainer: T };

export class PlexClient {
  private base: string;
  constructor(private cfg: Section<"plex">) {
    this.base = normalizeBaseUrl(cfg.url);
  }

  get configured(): boolean {
    return !!this.base && !!this.cfg.token;
  }

  private headers() {
    return {
      "X-Plex-Token": this.cfg.token,
      "X-Plex-Product": "Newzlettr",
      "X-Plex-Client-Identifier": "newzlettr",
      Accept: "application/json",
    };
  }

  async get<T>(path: string, params: Record<string, string | number> = {}, timeoutMs = 10_000): Promise<T> {
    if (!this.configured) throw new HttpError("Plex is not configured");
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]): [string, string] => [k, String(v)]));
    const url = `${this.base}${path}${qs.size ? `?${qs}` : ""}`;
    try {
      return await httpJson<T>(url, { headers: this.headers(), timeoutMs, ignoreTlsErrors: this.cfg.ignoreTlsErrors });
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) throw new HttpError("Plex rejected the token (401 Unauthorized)", 401);
      throw e;
    }
  }

  async identity(): Promise<{ machineIdentifier: string; version: string }> {
    const r = await this.get<MC<{ machineIdentifier: string; version: string }>>("/identity", {}, 6000);
    return r.MediaContainer;
  }

  /** Checks token validity too (/identity is unauthenticated on Plex). */
  async serverInfo(): Promise<{ machineIdentifier: string; version: string; friendlyName: string }> {
    const r = await this.get<MC<{ machineIdentifier: string; version: string; friendlyName: string }>>("/", {}, 8000);
    return r.MediaContainer;
  }

  /**
   * Plex lets LAN clients in without a token when "allowed networks" is set, so a bad token can
   * look fine from home. plex.tv is authoritative: 401 there = the token is wrong.
   * Returns null when plex.tv can't be reached (we then can't tell).
   */
  async tokenValidAtPlexTv(): Promise<{ valid: boolean; username?: string } | null> {
    try {
      const res = await httpFetch("https://plex.tv/api/v2/user", {
        headers: { "X-Plex-Token": this.cfg.token, "X-Plex-Client-Identifier": "newzlettr", Accept: "application/json" },
        timeoutMs: 6000,
      });
      if (res.status === 401) return { valid: false };
      if (!res.ok) return null;
      const body = (await res.json()) as { username?: string };
      return { valid: true, username: body.username };
    } catch {
      return null;
    }
  }

  /**
   * Everyone this server is shared with, and which libraries each person has
   * (plex.tv shared_servers for this machine). Requires the server owner's token.
   */
  async sharedUsers(machineIdentifier: string): Promise<PlexSharedUser[]> {
    const res = await httpFetch(`https://plex.tv/api/servers/${encodeURIComponent(machineIdentifier)}/shared_servers`, {
      headers: { "X-Plex-Token": this.cfg.token, "X-Plex-Client-Identifier": "newzlettr", Accept: "application/xml" },
      timeoutMs: 15_000,
    });
    if (res.status === 401) throw new HttpError("plex.tv rejected the token — use the server owner's Plex token", 401);
    if (!res.ok) throw new HttpError(`plex.tv returned ${res.status}`, res.status);
    return parseSharedUsers(await res.text());
  }

  async sections(): Promise<PlexSection[]> {
    const r = await this.get<MC<{ Directory?: PlexSection[] }>>("/library/sections");
    return (r.MediaContainer.Directory ?? []).map(({ key, title, type, agent }) => ({ key, title, type, agent }));
  }

  private async count(sectionKey: string, type: number): Promise<number> {
    const r = await this.get<MC<{ totalSize?: number; size?: number }>>(`/library/sections/${sectionKey}/all`, {
      type,
      "X-Plex-Container-Start": 0,
      "X-Plex-Container-Size": 0,
    });
    return Number(r.MediaContainer.totalSize ?? r.MediaContainer.size ?? 0);
  }

  async libraryTotals(): Promise<LibraryTotals> {
    const sections = await this.sections();
    // Count every library first, then add up. (Summing with `totals.movies += await …` inside
    // Promise.all read the old total before the await, so the last library to answer won.)
    const counts = await Promise.all(
      sections.map(async (s) => {
        const kind = countedKind(s);
        if (kind === "movie") return { movies: await this.count(s.key, 1), shows: 0, episodes: 0 };
        if (kind === "show") {
          const [shows, episodes] = await Promise.all([this.count(s.key, 2), this.count(s.key, 4)]);
          return { movies: 0, shows, episodes };
        }
        return { movies: 0, shows: 0, episodes: 0 };
      }),
    );
    log.debug(
      { libraries: sections.map((s, i) => ({ title: s.title, type: s.type, agent: s.agent, counted: countedKind(s) !== null, ...counts[i] })) },
      "plex library totals",
    );
    const totals: LibraryTotals = { movies: 0, shows: 0, episodes: 0, sections };
    for (const c of counts) {
      totals.movies += c.movies;
      totals.shows += c.shows;
      totals.episodes += c.episodes;
    }
    return totals;
  }

  async metadata(ratingKey: string): Promise<PlexItem | null> {
    try {
      const r = await this.get<MC<{ Metadata?: PlexItem[] }>>(`/library/metadata/${encodeURIComponent(ratingKey)}`);
      return r.MediaContainer.Metadata?.[0] ?? null;
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) return null;
      throw e;
    }
  }

  /** Seasons of a show, or episodes of a season, in Plex order. */
  async children(ratingKey: string): Promise<PlexItem[]> {
    const r = await this.get<MC<{ Metadata?: PlexItem[] }>>(`/library/metadata/${encodeURIComponent(ratingKey)}/children`);
    return r.MediaContainer.Metadata ?? [];
  }

  async search(query: string, limit = 12): Promise<PlexItem[]> {
    const r = await this.get<MC<{ Hub?: { type: string; Metadata?: PlexItem[] }[] }>>("/hubs/search", {
      query,
      limit,
      includeCollections: 0,
    });
    const out: PlexItem[] = [];
    for (const hub of r.MediaContainer.Hub ?? []) {
      if (!["movie", "show", "episode", "season"].includes(hub.type)) continue;
      out.push(...(hub.Metadata ?? []));
    }
    return out.slice(0, limit * 2);
  }

  /**
   * Poster/art bytes, resized by Plex's transcoder so emails stay small.
   * `path` must be a Plex-relative image path like /library/metadata/123/thumb/456.
   */
  async image(path: string, width = 300, height = 450): Promise<{ bytes: Buffer; contentType: string }> {
    if (!path.startsWith("/")) throw new HttpError("invalid Plex image path");
    const qs = new URLSearchParams({ width: String(width), height: String(height), minSize: "1", upscale: "1", url: path });
    const res = await httpFetch(`${this.base}/photo/:/transcode?${qs}`, {
      headers: { "X-Plex-Token": this.cfg.token },
      timeoutMs: 15_000,
      ignoreTlsErrors: this.cfg.ignoreTlsErrors,
    });
    if (!res.ok) throw new HttpError(`Plex image ${res.status}`, res.status);
    return { bytes: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get("content-type") ?? "image/jpeg" };
  }
}

/** Link that opens an item in Plex Web for any user with access. */
export function plexWebLink(machineIdentifier: string, ratingKey: string): string {
  return `https://app.plex.tv/desktop/#!/server/${machineIdentifier}/details?key=${encodeURIComponent(`/library/metadata/${ratingKey}`)}`;
}

/**
 * Parses plex.tv shared_servers XML. Only the fields we need are read - each share also
 * carries the person's accessToken, which is deliberately ignored (never stored or logged).
 */
export function parseSharedUsers(xmlText: string): PlexSharedUser[] {
  const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", isArray: (name) => name === "SharedServer" || name === "Section" }).parse(xmlText) as {
    MediaContainer?: { SharedServer?: (Record<string, string> & { Section?: Record<string, string>[] })[] };
  };
  return (xml.MediaContainer?.SharedServer ?? []).map((s) => {
    const sections = s.Section ?? [];
    return {
      userId: String(s.userID ?? ""),
      username: String(s.username ?? ""),
      title: String(s.name ?? s.username ?? ""),
      email: String(s.email ?? "").trim().toLowerCase(),
      pending: !s.acceptedAt || s.acceptedAt === "0",
      libraries: sections
        .filter((x) => x.shared === "1")
        .map((x) => String(x.title))
        .sort((a, b) => a.localeCompare(b)),
      allLibraries: s.allLibraries === "1",
    };
  });
}
