import { describe, expect, it } from "vitest";
import type { MediaRef } from "../../shared/types.js";
import { subtractPlays } from "../src/data/stats.js";
import { totalsFromSeries } from "../src/integrations/tautulli.js";

const m = (ratingKey: string, title: string, plays: number): MediaRef => ({ ratingKey, title, plays });

describe("leaving the host out of Most watched", () => {
  // Everyone's top list, and the host's own (as Tautulli returns them with user_id).
  const everyone = [m("100", "Commando", 30), m("200", "Heat", 6), m("300", "Verity", 5), m("400", "Red Heat", 2)];
  const host = [m("100", "Commando", 30), m("400", "Red Heat", 1), m("999", "Only on host list", 4)];

  it("subtracts the host's plays per title, drops titles only they watched, and re-ranks", () => {
    expect(subtractPlays(everyone, host).map((x) => [x.title, x.plays])).toEqual([
      ["Heat", 6],
      ["Verity", 5],
      ["Red Heat", 1],
    ]);
  });

  it("is a no-op with nothing to subtract and never goes negative", () => {
    expect(subtractPlays(everyone, [])).toEqual(everyone);
    expect(subtractPlays([m("1", "A", 2)], [m("1", "A", 5)])).toEqual([]);
  });

  it("can be applied once per excluded person", () => {
    const other = [m("200", "Heat", 6)];
    expect(subtractPlays(subtractPlays(everyone, host), other).map((x) => x.title)).toEqual(["Verity", "Red Heat"]);
  });
});

describe("window totals", () => {
  it("ignores Tautulli's aggregate Total series (it double-counted hours before)", () => {
    const plays = { categories: ["d1", "d2"], series: [{ name: "TV", data: [10, 5] }, { name: "Movies", data: [2, 3] }, { name: "Live TV", data: [0, 1] }, { name: "Total", data: [12, 9] }] };
    const dur = { categories: ["d1", "d2"], series: [{ name: "TV", data: [3600, 0] }, { name: "Movies", data: [7200, 0] }, { name: "Total", data: [10800, 0] }] };
    expect(totalsFromSeries(plays, dur)).toEqual({ moviePlays: 5, episodePlays: 16, seconds: 10800 });
  });
});
