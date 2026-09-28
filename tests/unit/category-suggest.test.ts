import { describe, expect, it } from "vitest";
import {
  mergeSuggestionScores,
  normaliseQuery,
  parseKeywords,
} from "@/server/services/category-suggest.service";

/** D43: the inputs to category suggestions. The ranking itself runs in SQL. */

describe("normaliseQuery", () => {
  it("collapses spaces and needs two characters", () => {
    expect(normaliseQuery("  led   bulb  ")).toBe("led bulb");
    expect(normaliseQuery("a")).toBeNull();
  });
  it("caps the length", () => {
    expect(normaliseQuery("x".repeat(200))?.length).toBe(80);
  });
});

describe("parseKeywords", () => {
  it("splits, lower-cases and de-duplicates", () => {
    expect(parseKeywords("CCTV, Camera ,dvr, camera\nNVR")).toEqual([
      "cctv",
      "camera",
      "dvr",
      "nvr",
    ]);
  });
  it("drops empties and single letters", () => {
    expect(parseKeywords(", a , ,ok")).toEqual(["ok"]);
  });
});

describe("mergeSuggestionScores", () => {
  it("keeps a name match above a category found only through products", () => {
    // "cctv camera": the name matches 1 of 2 words; a seller filed a CCTV
    // camera under Networking.
    const ranked = mergeSuggestionScores(
      [{ id: "cctv", score: 0.7, depth: 1 }],
      [{ categoryId: "networking", n: 10 }],
    );
    expect(ranked.map(([id]) => id)).toEqual(["cctv", "networking"]);
  });
  it("boosts a name match that also holds matching products", () => {
    const ranked = mergeSuggestionScores(
      [
        { id: "a", score: 0.7, depth: 1 },
        { id: "b", score: 0.7, depth: 1 },
      ],
      [{ categoryId: "b", n: 1 }],
    );
    expect(ranked[0]?.[0]).toBe("b");
  });
  it("drops weak name matches", () => {
    expect(mergeSuggestionScores([{ id: "x", score: 0.3, depth: 2 }], [])).toEqual([]);
  });
});
