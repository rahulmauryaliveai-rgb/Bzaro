import { describe, expect, it } from "vitest";
import {
  MIN_LEAD_LIFETIME_MS,
  chooseSlot,
  istDayStart,
  istWeekEnd,
  istWeekStart,
  slotExpiry,
  weeklyProgress,
} from "@/lib/leads/quota";

/**
 * D41 lead delivery: Pro 10/week + 1 a day, Gold 20/week + 1 a day, in IST.
 * The boundaries are the bug magnets — Sunday night, Monday just after
 * midnight IST (still Sunday in UTC) — so they are pinned here.
 */

// IST = UTC + 05:30
const ist = (local: string) => new Date(`${local}+05:30`);

describe("IST calendar", () => {
  it("starts the week on Monday 00:00 IST", () => {
    // Wednesday 30 Sep 2026, 15:00 IST
    expect(istWeekStart(ist("2026-09-30T15:00:00"))).toEqual(ist("2026-09-28T00:00:00"));
    expect(istWeekEnd(ist("2026-09-30T15:00:00"))).toEqual(ist("2026-10-05T00:00:00"));
  });

  it("treats Monday 00:30 IST as the new week even though UTC is still Sunday", () => {
    const mondayEarly = ist("2026-10-05T00:30:00");
    expect(mondayEarly.getUTCDay()).toBe(0);
    expect(istWeekStart(mondayEarly)).toEqual(ist("2026-10-05T00:00:00"));
  });

  it("keeps Sunday 23:59 IST in the old week", () => {
    expect(istWeekStart(ist("2026-10-04T23:59:00"))).toEqual(ist("2026-09-28T00:00:00"));
  });

  it("finds the IST day start", () => {
    expect(istDayStart(ist("2026-09-30T00:10:00"))).toEqual(ist("2026-09-30T00:00:00"));
  });
});

describe("chooseSlot", () => {
  const pro = { weeklyQuota: 10, dailyQuota: 1 };

  it("uses the weekly allowance first", () => {
    expect(chooseSlot({ ...pro, weeklyUsed: 0, dailyUsedToday: 0 })).toBe("WEEKLY");
    expect(chooseSlot({ ...pro, weeklyUsed: 9, dailyUsedToday: 0 })).toBe("WEEKLY");
  });

  it("then one lead of the day", () => {
    expect(chooseSlot({ ...pro, weeklyUsed: 10, dailyUsedToday: 0 })).toBe("DAILY");
    expect(chooseSlot({ ...pro, weeklyUsed: 10, dailyUsedToday: 1 })).toBeNull();
  });

  it("gives Free (no daily lead) nothing once the week is used", () => {
    expect(
      chooseSlot({ weeklyQuota: 5, dailyQuota: 0, weeklyUsed: 5, dailyUsedToday: 0 }),
    ).toBeNull();
  });

  it("treats a null weekly quota as uncapped", () => {
    expect(
      chooseSlot({ weeklyQuota: null, dailyQuota: 0, weeklyUsed: 500, dailyUsedToday: 0 }),
    ).toBe("WEEKLY");
  });
});

describe("slotExpiry", () => {
  it("expires a weekly lead at the end of the IST week", () => {
    expect(slotExpiry("WEEKLY", ist("2026-09-29T10:00:00"))).toEqual(ist("2026-10-05T00:00:00"));
  });

  it("expires the lead of the day at the end of the next IST day", () => {
    expect(slotExpiry("DAILY", ist("2026-09-29T10:00:00"))).toEqual(ist("2026-10-01T00:00:00"));
  });

  it("never gives a lead less than a day", () => {
    const lateSunday = ist("2026-10-04T23:00:00");
    expect(slotExpiry("WEEKLY", lateSunday).getTime()).toBe(
      lateSunday.getTime() + MIN_LEAD_LIFETIME_MS,
    );
  });
});

describe("weeklyProgress", () => {
  it("caps the displayed count at the quota", () => {
    expect(weeklyProgress({ weeklyQuota: 10, weeklyUsed: 12 })).toEqual({
      used: 10,
      quota: 10,
      exhausted: true,
    });
    expect(weeklyProgress({ weeklyQuota: null, weeklyUsed: 3 })).toBeNull();
  });
});
