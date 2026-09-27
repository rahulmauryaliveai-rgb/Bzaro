import { describe, expect, it } from "vitest";
import {
  checkCouponUsable,
  couponAppliesTo,
  discountFor,
  normaliseCouponCode,
  splitInclusive,
  type CouponRule,
} from "@/lib/billing/coupon";

/** D42 coupons: who can use one, what it covers, and what it takes off. */

const base: CouponRule = {
  code: "TEST",
  kind: "PERCENT_OFF",
  isActive: true,
  startsAt: null,
  endsAt: null,
  maxRedemptions: null,
  redemptionCount: 0,
  perSellerLimit: 1,
  newSellersOnly: false,
  percentOff: 20,
  amountOffMinor: null,
  appliesTo: [],
  planKeys: [],
  passMonths: null,
  passPriceMinor: null,
};
const ctx = { now: new Date("2026-10-01T00:00:00Z"), sellerRedemptions: 0, hasPaidBefore: false };

describe("normaliseCouponCode", () => {
  it("upper-cases and strips spaces", () => {
    expect(normaliseCouponCode("  pro 3 for 1 ")).toBe("PRO3FOR1");
    expect(normaliseCouponCode("bz-7kq4x9")).toBe("BZ-7KQ4X9");
  });
  it("rejects junk", () => {
    expect(normaliseCouponCode("ab")).toBeNull();
    expect(normaliseCouponCode("DROP;TABLE")).toBeNull();
  });
});

describe("checkCouponUsable", () => {
  it("accepts a plain live coupon", () => {
    expect(checkCouponUsable(base, ctx)).toEqual({ ok: true });
  });
  it.each([
    ["inactive", { ...base, isActive: false }, ctx],
    ["not started", { ...base, startsAt: new Date("2026-11-01") }, ctx],
    ["expired", { ...base, endsAt: new Date("2026-09-01") }, ctx],
    ["used up", { ...base, maxRedemptions: 5, redemptionCount: 5 }, ctx],
    ["already used by this seller", base, { ...ctx, sellerRedemptions: 1 }],
    ["new sellers only", { ...base, newSellersOnly: true }, { ...ctx, hasPaidBefore: true }],
  ])("refuses when %s", (_label, coupon, context) => {
    expect(checkCouponUsable(coupon, context).ok).toBe(false);
  });
});

describe("couponAppliesTo", () => {
  it("applies everywhere when nothing is ticked", () => {
    expect(couponAppliesTo(base, "LEAD_PACK")).toBe(true);
    expect(couponAppliesTo(base, "PLAN_MONTHLY", "pro")).toBe(true);
  });
  it("respects targets and plan keys", () => {
    const goldYearly = { ...base, appliesTo: ["PLAN_YEARLY"], planKeys: ["gold"] };
    expect(couponAppliesTo(goldYearly, "PLAN_YEARLY", "gold")).toBe(true);
    expect(couponAppliesTo(goldYearly, "PLAN_YEARLY", "pro")).toBe(false);
    expect(couponAppliesTo(goldYearly, "PLAN_MONTHLY", "gold")).toBe(false);
    expect(couponAppliesTo(goldYearly, "LEAD_PACK")).toBe(false);
  });
  it("never treats a plan pass as a discount", () => {
    expect(couponAppliesTo({ ...base, kind: "PLAN_PASS" }, "LEAD_PACK")).toBe(false);
  });
});

describe("discountFor", () => {
  it("takes a percentage off, rounded to the paisa", () => {
    expect(discountFor({ kind: "PERCENT_OFF", percentOff: 20, amountOffMinor: null }, 99_900)).toBe(
      19_980,
    );
  });
  it("never discounts below zero", () => {
    expect(
      discountFor({ kind: "FLAT_OFF", percentOff: null, amountOffMinor: 500_000 }, 49_900),
    ).toBe(49_900);
  });
  it("makes a ₹499 lead pack ₹99 with ₹400 off", () => {
    expect(
      49_900 - discountFor({ kind: "FLAT_OFF", percentOff: null, amountOffMinor: 40_000 }, 49_900),
    ).toBe(9_900);
  });
});

describe("splitInclusive", () => {
  it("splits a ₹1 pass so the invoice adds up to exactly ₹1", () => {
    expect(splitInclusive(100, 18)).toEqual({ baseMinor: 85, taxMinor: 15, totalMinor: 100 });
  });
  it("handles a free pass", () => {
    expect(splitInclusive(0, 18)).toEqual({ baseMinor: 0, taxMinor: 0, totalMinor: 0 });
  });
});
