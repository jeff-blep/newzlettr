import { describe, expect, it } from "vitest";
import { plexItemToRef } from "../src/api/media.js";

describe("Host's Pick refs", () => {
  it("episodes carry their show and season so the picker can rebuild itself", () => {
    const r = plexItemToRef({
      ratingKey: "378471",
      type: "episode",
      title: "Merger",
      grandparentTitle: "The Office",
      grandparentRatingKey: "378462",
      grandparentThumb: "/library/metadata/378462/thumb/1",
      parentRatingKey: "378470",
      parentIndex: 2,
      index: 1,
    });
    expect(r).toMatchObject({
      title: "The Office",
      subtitle: "Season 2, Episode 1 – Merger",
      episodeTitle: "Merger",
      thumb: "/library/metadata/378462/thumb/1",
      showRatingKey: "378462",
      seasonRatingKey: "378470",
      index: 1,
      parentIndex: 2,
    });
  });

  it("seasons point at their show; shows and movies have no parent", () => {
    expect(plexItemToRef({ ratingKey: "2", type: "season", title: "Season 2", parentTitle: "The Office", parentRatingKey: "1", leafCount: 6 })).toMatchObject({
      showRatingKey: "1",
      episodeCount: 6,
    });
    expect(plexItemToRef({ ratingKey: "1", type: "show", title: "The Office", leafCount: 12 }).showRatingKey).toBeUndefined();
    expect(plexItemToRef({ ratingKey: "9", type: "movie", title: "Commando" }).seasonRatingKey).toBeUndefined();
  });
});
