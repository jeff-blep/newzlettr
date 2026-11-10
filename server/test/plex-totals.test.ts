import { afterEach, describe, expect, it, vi } from "vitest";
import { countedKind, PlexClient, type PlexSection } from "../src/integrations/plex.js";

const SECTIONS: PlexSection[] = [
  { key: "1", title: "Movies", type: "movie", agent: "tv.plex.agents.movie" },
  { key: "2", title: "TV Recordings", type: "movie", agent: "tv.plex.agents.none" }, // "Other Videos"
  { key: "3", title: "Movies 4K", type: "movie", agent: "com.plexapp.agents.imdb" },
  { key: "4", title: "TV Shows", type: "show", agent: "tv.plex.agents.series" },
  { key: "5", title: "Home Shows", type: "show", agent: "com.plexapp.agents.none" }, // legacy personal media
  { key: "6", title: "Music", type: "artist", agent: "tv.plex.agents.music" },
];

// section key -> Plex type number -> totalSize
const SIZES: Record<string, Record<number, number>> = {
  "1": { 1: 1200 },
  "2": { 1: 0 },
  "3": { 1: 40 },
  "4": { 2: 79, 4: 1500 },
  "5": { 2: 3, 4: 30 },
};
// The library that should be ignored answers last — that's what zeroed the old total.
const DELAY_MS: Record<string, number> = { "1": 5, "3": 10, "2": 40 };

afterEach(() => vi.restoreAllMocks());

describe("countedKind", () => {
  it("counts only the Movies and TV Shows categories, not Other Videos or music", () => {
    expect(SECTIONS.map(countedKind)).toEqual(["movie", null, "movie", "show", null, null]);
  });

  it("falls back to type when Plex omits the agent", () => {
    expect(countedKind({ key: "9", title: "x", type: "movie" })).toBe("movie");
  });
});

describe("PlexClient.libraryTotals", () => {
  it("adds up every Movies/TV Shows library, regardless of which answers last", async () => {
    vi.spyOn(PlexClient.prototype, "get").mockImplementation((async (path: string, params: Record<string, string | number> = {}) => {
      if (path === "/library/sections") return { MediaContainer: { Directory: SECTIONS } };
      const key = /^\/library\/sections\/(\w+)\/all$/.exec(path)?.[1];
      if (!key) throw new Error(`unexpected ${path}`);
      await new Promise((r) => setTimeout(r, DELAY_MS[key] ?? 0));
      return { MediaContainer: { size: 0, totalSize: SIZES[key]?.[Number(params.type)] ?? 0 } };
    }) as PlexClient["get"]);

    const c = new PlexClient({ url: "http://plex.local:32400", token: "t", ignoreTlsErrors: false } as never);
    const t = await c.libraryTotals();
    expect({ movies: t.movies, shows: t.shows, episodes: t.episodes }).toEqual({ movies: 1240, shows: 79, episodes: 1500 });
  });
});
