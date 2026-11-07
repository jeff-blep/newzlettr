import type { Section } from "../settings.js";
import { HttpError, httpJson, normalizeBaseUrl } from "./http.js";

/** Read-only commands only. Newzlettr never calls anything that changes Tautulli. */
const ALLOWED = new Set([
  "get_tautulli_info",
  "get_home_stats",
  "get_plays_by_date",
  "get_recently_added",
  "get_children_metadata",
  "get_metadata",
  "get_users",
  "get_libraries",
]);

export interface HomeStatRow {
  title?: string;
  grandparent_title?: string;
  year?: number;
  rating_key?: number | string;
  grandparent_rating_key?: number | string;
  thumb?: string;
  grandparent_thumb?: string;
  total_plays?: number;
  total_duration?: number;
  users_watched?: number;
  platform?: string;
  platform_name?: string;
  media_type?: string;
}

export interface HomeStat {
  stat_id: string;
  stat_title?: string;
  rows: HomeStatRow[];
}

export interface RecentItem {
  rating_key: string;
  parent_rating_key?: string;
  grandparent_rating_key?: string;
  media_type: string; // movie | show | season | episode
  title: string;
  parent_title?: string;
  grandparent_title?: string;
  year?: string | number;
  added_at: string | number; // epoch seconds
  thumb?: string;
  parent_thumb?: string;
  grandparent_thumb?: string;
  media_index?: string | number;
  parent_media_index?: string | number;
  library_name?: string;
  section_id?: string | number;
}

export interface TautulliUser {
  user_id: number;
  username: string;
  friendly_name: string;
  email: string;
  is_active?: number;
}

interface PlaysSeries {
  categories: string[];
  series: { name: string; data: number[] }[];
}

export class TautulliClient {
  private base: string;
  constructor(private cfg: Section<"tautulli">) {
    this.base = normalizeBaseUrl(cfg.url);
  }

  get configured(): boolean {
    return !!this.base && !!this.cfg.apiKey;
  }

  async call<T>(cmd: string, params: Record<string, string | number> = {}, timeoutMs = 15_000): Promise<T> {
    if (!ALLOWED.has(cmd)) throw new Error(`Tautulli command not allowed: ${cmd}`);
    if (!this.configured) throw new HttpError("Tautulli is not configured");
    const qs = new URLSearchParams({ apikey: this.cfg.apiKey, cmd, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
    let r: { response?: { result?: string; message?: string | null; data?: T } };
    try {
      r = await httpJson(`${this.base}/api/v2?${qs}`, { timeoutMs, ignoreTlsErrors: this.cfg.ignoreTlsErrors });
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) throw new HttpError("Tautulli rejected the API key", 401);
      throw e;
    }
    if (r.response?.result !== "success") {
      const msg = r.response?.message || "unexpected response";
      throw new HttpError(/api key/i.test(msg) ? "Tautulli rejected the API key" : `Tautulli: ${msg}`);
    }
    return r.response.data as T;
  }

  info() {
    return this.call<{ tautulli_version: string }>("get_tautulli_info", {}, 8000);
  }

  homeStats(days: number, count = 25) {
    return this.call<HomeStat[]>("get_home_stats", { time_range: days, stats_type: "plays", stats_count: count, grouping: 0 });
  }

  /** Totals for the window: plays and watch time, split by Movies / TV. */
  async windowTotals(days: number): Promise<{ moviePlays: number; episodePlays: number; seconds: number }> {
    const [plays, duration] = await Promise.all([
      this.call<PlaysSeries>("get_plays_by_date", { time_range: days, y_axis: "plays", grouping: 0 }),
      this.call<PlaysSeries>("get_plays_by_date", { time_range: days, y_axis: "duration", grouping: 0 }),
    ]);
    const sum = (s: PlaysSeries, re: RegExp) =>
      s.series.filter((x) => re.test(x.name)).reduce((a, x) => a + x.data.reduce((b, n) => b + (Number(n) || 0), 0), 0);
    return {
      moviePlays: sum(plays, /movie/i),
      episodePlays: sum(plays, /tv|episode|show/i),
      seconds: duration.series.reduce((a, x) => a + x.data.reduce((b, n) => b + (Number(n) || 0), 0), 0),
    };
  }

  /** Recently added items newer than `sinceEpoch` (seconds). Tautulli returns newest first. */
  async recentlyAdded(sinceEpoch: number, mediaType?: "movie" | "show", max = 500): Promise<RecentItem[]> {
    const data = await this.call<{ recently_added?: RecentItem[] }>("get_recently_added", {
      count: max,
      ...(mediaType ? { media_type: mediaType } : {}),
    });
    return (data.recently_added ?? []).filter((r) => Number(r.added_at) >= sinceEpoch);
  }

  async childrenMetadata(ratingKey: string | number): Promise<RecentItem[]> {
    const data = await this.call<{ children_list?: RecentItem[] }>("get_children_metadata", { rating_key: ratingKey });
    return data.children_list ?? [];
  }

  async users(): Promise<TautulliUser[]> {
    const data = await this.call<TautulliUser[]>("get_users");
    return Array.isArray(data) ? data : [];
  }
}
