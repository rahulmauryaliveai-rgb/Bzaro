import { describe, expect, it } from "vitest";
import { matchCity } from "../../prisma/seed/pincodes";

const city = (slug: string, state: string) => ({
  id: `id-${slug}`,
  slug,
  name: slug,
  path: `/in/${state}/${slug}`,
});

const cities = new Map(
  [
    city("new-delhi", "delhi"),
    city("noida", "uttar-pradesh"),
    city("greater-noida", "uttar-pradesh"),
    city("meetut", "uttar-pradesh"),
    city("mumbai", "maharashtra"),
    city("pune", "maharashtra"),
    city("indore", "madhya-pradesh"),
  ].map((c) => [c.slug, c]),
);

const row = (district: string, state: string, latitude: number | null, longitude: number | null) => ({
  pincode: "000000",
  district,
  state,
  latitude,
  longitude,
});

describe("matchCity", () => {
  it("maps every Delhi district to the Delhi city", () => {
    expect(matchCity(row("Shahdara", "Delhi", 28.67, 77.29), cities)?.slug).toBe("new-delhi");
  });

  it("splits a shared district by the nearer city centre", () => {
    expect(matchCity(row("Gautam Buddha Nagar", "Uttar Pradesh", 28.57, 77.33), cities)?.slug).toBe("noida");
    expect(matchCity(row("Gautam Buddha Nagar", "Uttar Pradesh", 28.46, 77.52), cities)?.slug).toBe("greater-noida");
  });

  it("uses the district alone when the coordinate was untrustworthy", () => {
    expect(matchCity(row("Gautam Buddha Nagar", "Uttar Pradesh", null, null), cities)?.slug).toBe("noida");
  });

  it("follows slug aliases (a typo'd taxonomy slug still links)", () => {
    expect(matchCity(row("Meerut", "Uttar Pradesh", 28.98, 77.7), cities)?.slug).toBe("meetut");
  });

  it("includes the Mumbai region but not the far end of a district", () => {
    expect(matchCity(row("Thane", "Maharashtra", 19.2, 72.97), cities)?.slug).toBe("mumbai");
    expect(matchCity(row("Pune", "Maharashtra", 18.0, 74.6), cities)).toBeNull();
  });

  it("falls back to a same-named city in the same state", () => {
    expect(matchCity(row("Indore", "Madhya Pradesh", 22.72, 75.86), cities)?.slug).toBe("indore");
    expect(matchCity(row("Indore", "Maharashtra", 22.72, 75.86), cities)).toBeNull();
  });

  it("leaves everything else unlinked", () => {
    expect(matchCity(row("Anantapur", "Andhra Pradesh", 14.68, 77.6), cities)).toBeNull();
  });
});
