/**
 * Coupon rules (decision D42). Pure — no database — so what a seller is
 * charged with a coupon is unit-tested.
 *
 * Three kinds:
 *   PLAN_PASS    a plan for N months at a fixed price that INCLUDES GST (so
 *                "Pro for 3 months for ₹1" charges exactly ₹1). No autopay:
 *                the plan simply ends when the pass does.
 *   PERCENT_OFF  % off the price before GST.
 *   FLAT_OFF     ₹ off the price before GST, never below zero.
 *
 * A discount on an autopay plan applies to every renewal of that subscription
 * (Razorpay charges one fixed amount per cycle) — admins who want a one-time
 * saving on a plan use a PLAN_PASS instead.
 */

export const COUPON_TARGETS = [
  "PLAN_MONTHLY",
  "PLAN_YEARLY",
  "LEAD_PACK",
  "PAYMENT_GATEWAY",
  "SHIPPING",
] as const;
export type CouponTarget = (typeof COUPON_TARGETS)[number];

export const TARGET_LABEL: Record<CouponTarget, string> = {
  PLAN_MONTHLY: "Monthly plans",
  PLAN_YEARLY: "Yearly plans",
  LEAD_PACK: "Lead packs",
  PAYMENT_GATEWAY: "Payment gateway add-on",
  SHIPPING: "Shipping add-on",
};

export type CouponRule = {
  code: string;
  kind: "PLAN_PASS" | "PERCENT_OFF" | "FLAT_OFF";
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  perSellerLimit: number;
  newSellersOnly: boolean;
  percentOff: number | null;
  amountOffMinor: number | null;
  appliesTo: string[];
  planKeys: string[];
  passMonths: number | null;
  passPriceMinor: number | null;
};

/** What the seller types → what we store: "  launch 50 " → "LAUNCH50". */
export function normaliseCouponCode(input: string): string | null {
  const code = input.trim().toUpperCase().replace(/\s+/g, "");
  return /^[A-Z0-9-]{3,30}$/.test(code) ? code : null;
}

export type Eligibility = { ok: true } | { ok: false; reason: string };

/** Whether this coupon may be used by this seller right now (target-free checks). */
export function checkCouponUsable(
  coupon: CouponRule,
  context: { now: Date; sellerRedemptions: number; hasPaidBefore: boolean },
): Eligibility {
  if (!coupon.isActive) return { ok: false, reason: "This coupon is no longer active." };
  if (coupon.startsAt && context.now < coupon.startsAt) {
    return { ok: false, reason: "This coupon is not active yet." };
  }
  if (coupon.endsAt && context.now > coupon.endsAt) {
    return { ok: false, reason: "This coupon has expired." };
  }
  if (coupon.maxRedemptions !== null && coupon.redemptionCount >= coupon.maxRedemptions) {
    return { ok: false, reason: "This coupon has been fully used." };
  }
  if (context.sellerRedemptions >= coupon.perSellerLimit) {
    return { ok: false, reason: "You have already used this coupon." };
  }
  if (coupon.newSellersOnly && context.hasPaidBefore) {
    return { ok: false, reason: "This coupon is for new sellers only." };
  }
  return { ok: true };
}

/** Whether a discount coupon covers this item (plan purchases pass the plan key). */
export function couponAppliesTo(
  coupon: Pick<CouponRule, "kind" | "appliesTo" | "planKeys">,
  target: CouponTarget,
  planKey?: string,
): boolean {
  if (coupon.kind === "PLAN_PASS") return false;
  if (coupon.appliesTo.length > 0 && !coupon.appliesTo.includes(target)) return false;
  if ((target === "PLAN_MONTHLY" || target === "PLAN_YEARLY") && coupon.planKeys.length > 0) {
    return planKey !== undefined && coupon.planKeys.includes(planKey);
  }
  return true;
}

/** The saving on a price before GST. Never more than the price itself. */
export function discountFor(
  coupon: Pick<CouponRule, "kind" | "percentOff" | "amountOffMinor">,
  baseMinor: number,
): number {
  if (coupon.kind === "PERCENT_OFF" && coupon.percentOff) {
    return Math.min(baseMinor, Math.round((baseMinor * coupon.percentOff) / 100));
  }
  if (coupon.kind === "FLAT_OFF" && coupon.amountOffMinor) {
    return Math.min(baseMinor, coupon.amountOffMinor);
  }
  return 0;
}

/**
 * Split a GST-inclusive pass price into taxable value + GST, so the invoice
 * still adds up: ₹1 at 18% → ₹0.85 + ₹0.15.
 */
export function splitInclusive(totalMinor: number, ratePercent: number) {
  const baseMinor = Math.round(totalMinor / (1 + ratePercent / 100));
  return { baseMinor, taxMinor: totalMinor - baseMinor, totalMinor };
}

/** One line for admin lists and seller banners. */
export function describeCoupon(
  coupon: Pick<
    CouponRule,
    | "kind"
    | "percentOff"
    | "amountOffMinor"
    | "passMonths"
    | "passPriceMinor"
    | "appliesTo"
    | "planKeys"
  > & { planName?: string | null },
  formatMoney: (minor: number) => string,
): string {
  if (coupon.kind === "PLAN_PASS") {
    const months = coupon.passMonths ?? 0;
    return `${coupon.planName ?? "Plan"} for ${months} month${months === 1 ? "" : "s"} at ${formatMoney(coupon.passPriceMinor ?? 0)} (incl. GST, no autopay)`;
  }
  const off =
    coupon.kind === "PERCENT_OFF"
      ? `${coupon.percentOff}% off`
      : `${formatMoney(coupon.amountOffMinor ?? 0)} off`;
  const targets =
    coupon.appliesTo.length === 0
      ? "everything"
      : coupon.appliesTo.map((t) => TARGET_LABEL[t as CouponTarget] ?? t).join(", ");
  const plans = coupon.planKeys.length > 0 ? ` (${coupon.planKeys.join(", ")})` : "";
  return `${off} ${targets}${plans}`;
}
