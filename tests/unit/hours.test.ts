import { describe, expect, it } from "vitest";
import { formatInterval, isOpenNow, parseBusinessHours, weekSchedule } from "@/lib/utils/hours";

/**
 * Business hours.
 *
 * The open/closed badge is computed server-side in the SELLER's timezone, not
 * the visitor's. Getting that backwards would tell a buyer in London that a
 * Mumbai supplier is closed at 3pm IST.
 */

const HOURS = {
  mon: [{ open: "09:30", close: "18:30" }],
  sat: [{ open: "10:00", close: "14:00" }],
};

describe("parseBusinessHours", () => {
  it("accepts a valid object", () => {
    expect(parseBusinessHours(HOURS)).not.toBeNull();
  });

  it("returns null for null, undefined and non-objects", () => {
    expect(parseBusinessHours(null)).toBeNull();
    expect(parseBusinessHours(undefined)).toBeNull();
    expect(parseBusinessHours("09:00")).toBeNull();
  });

  it("returns null for malformed times rather than throwing", () => {
    // The column is seller-supplied. A bad value must degrade to "not listed",
    // never throw inside a cached page render.
    expect(parseBusinessHours({ mon: [{ open: "9am", close: "6pm" }] })).toBeNull();
    expect(parseBusinessHours({ mon: [{ open: "25:00", close: "26:00" }] })).toBeNull();
  });

  it("returns null when every day is empty", () => {
    // An object full of empty arrays is "not listed", not "closed all week".
    expect(parseBusinessHours({ mon: [], tue: [] })).toBeNull();
  });
});

describe("weekSchedule", () => {
  it("expands to all seven days with closed flags", () => {
    const schedule = weekSchedule(parseBusinessHours(HOURS)!);
    expect(schedule).toHaveLength(7);
    expect(schedule.find((d) => d.day === "mon")?.closed).toBe(false);
    expect(schedule.find((d) => d.day === "sun")?.closed).toBe(true);
  });

  it("keeps days in Monday-first order", () => {
    const schedule = weekSchedule(parseBusinessHours(HOURS)!);
    expect(schedule[0]?.day).toBe("mon");
    expect(schedule[6]?.day).toBe("sun");
  });
});

describe("formatInterval", () => {
  it("renders 12-hour times", () => {
    expect(formatInterval({ open: "09:30", close: "18:30" })).toBe("9:30 am – 6:30 pm");
  });

  it("omits :00 minutes", () => {
    expect(formatInterval({ open: "10:00", close: "14:00" })).toBe("10 am – 2 pm");
  });

  it("renders noon and midnight correctly", () => {
    // 12-hour formatting where hour % 12 === 0 must show 12, not 0.
    expect(formatInterval({ open: "00:00", close: "12:00" })).toBe("12 am – 12 pm");
  });
});

describe("isOpenNow", () => {
  const hours = parseBusinessHours(HOURS)!;

  it("is open during listed hours in the seller's timezone", () => {
    // 2026-01-05 is a Monday. 12:00 UTC is 17:30 IST — inside 09:30–18:30.
    const noonUtc = new Date("2026-01-05T12:00:00Z");
    expect(isOpenNow(hours, "Asia/Kolkata", noonUtc)).toBe(true);
  });

  it("is closed outside listed hours", () => {
    // 20:00 UTC Monday is 01:30 IST Tuesday — Tuesday has no hours listed.
    expect(isOpenNow(hours, "Asia/Kolkata", new Date("2026-01-05T20:00:00Z"))).toBe(false);
  });

  it("uses the seller's timezone, not the server's", () => {
    // The same instant is inside hours in Kolkata and outside in New York.
    const instant = new Date("2026-01-05T12:00:00Z");
    expect(isOpenNow(hours, "Asia/Kolkata", instant)).toBe(true);
    expect(isOpenNow(hours, "America/New_York", instant)).toBe(false);
  });

  it("is closed on a day with no hours", () => {
    // 2026-01-04 is a Sunday.
    expect(isOpenNow(hours, "Asia/Kolkata", new Date("2026-01-04T12:00:00Z"))).toBe(false);
  });

  it("returns null for an invalid timezone instead of throwing", () => {
    expect(isOpenNow(hours, "Not/AZone", new Date("2026-01-05T12:00:00Z"))).toBeNull();
  });
});
