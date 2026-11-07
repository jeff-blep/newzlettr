import { describe, expect, it } from "vitest";
import { compareValues } from "./sortable";

describe("compareValues", () => {
  it("sorts text naturally and case-insensitively", () => {
    expect(["item 10", "Item 2", "apple"].sort(compareValues)).toEqual(["apple", "Item 2", "item 10"]);
  });
  it("puts empty values last", () => {
    expect(["b", null, "", "a", undefined].sort(compareValues)).toEqual(["a", "b", null, "", undefined]);
  });
  it("orders numbers and booleans (true first)", () => {
    expect([3, 1, 2].sort(compareValues)).toEqual([1, 2, 3]);
    expect([false, true].sort(compareValues)).toEqual([true, false]);
  });
});
