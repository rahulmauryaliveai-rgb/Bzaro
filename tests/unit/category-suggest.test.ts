import { describe, expect, it } from "vitest";
import { normaliseQuery, parseKeywords } from "@/server/services/category-suggest.service";

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
