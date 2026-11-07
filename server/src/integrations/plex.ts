import type { Section } from "../settings.js";
import { HttpError, httpFetch, httpJson, normalizeBaseUrl } from "./http.js";

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
  parentTitle?: string;
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

export interface LibraryTotals {
  movies: number;
  shows: number;
  episodes: number;
  sections: { key: string; title: string; type: string }[];
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

  async sections(): Promise<{ key: string; title: string; type: string }[]> {
    const r = await this.get<MC<{ Directory?: { key: string; title: string; type: string }[] }>>("/library/sections");
    return (r.MediaContainer.Directory ?? []).map(({ key, title, type }) => ({ key, title, type }));
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
    const totals: LibraryTotals = { movies: 0, shows: 0, episodes: 0, sections };
    await Promise.all(
      sections.map(async (s) => {
        if (s.type === "movie") totals.movies += await this.count(s.key, 1);
        if (s.type === "show") {
          const [shows, eps] = await Promise.all([this.count(s.key, 2), this.count(s.key, 4)]);
          totals.shows += shows;
          totals.episodes += eps;
        }
      }),
    );
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
