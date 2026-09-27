import "server-only";
import { db, Prisma } from "@/lib/db";
import {
  checkCouponUsable,
  couponAppliesTo,
  discountFor,
  normaliseCouponCode,
  type CouponRule,
  type CouponTarget,
} from "@/lib/billing/coupon";

/**
 * Coupons (decision D42): lookup, eligibility, redemption bookkeeping and the
 * admin CRUD. The money arithmetic is pure (src/lib/billing/coupon.ts); the
 * checkout paths in billing.service call in here.
 *
 * A redemption is written only when the payment is confirmed (or at once for a
 * ₹0 pass) — never at checkout start — so an abandoned Razorpay window does
 * not use up a seller's one go or the coupon's cap.
 */

type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

const couponSelect = {
  id: true,
  code: true,
  description: true,
  kind: true,
  isActive: true,
  startsAt: true,
  endsAt: true,
  maxRedemptions: true,
  redemptionCount: true,
  perSellerLimit: true,
  newSellersOnly: true,
  percentOff: true,
  amountOffMinor: true,
  appliesTo: true,
  planKeys: true,
  passMonths: true,
  passPriceMinor: true,
  planId: true,
} as const;

export type LoadedCoupon = CouponRule & {
  id: string;
  description: string | null;
  planId: string | null;
  plan: { id: string; key: string; name: string } | null;
};

export async function hasPaidBefore(sellerId: string): Promise<boolean> {
  const [payment, purchase] = await Promise.all([
    db.payment.findFirst({ where: { sellerId }, select: { id: true } }),
    db.purchase.findFirst({
      where: { sellerId, status: "PAID", totalMinor: { gt: 0 } },
      select: { id: true },
    }),
  ]);
  return Boolean(payment || purchase);
}

export type CouponLookup = { ok: true; coupon: LoadedCoupon } | { ok: false; reason: string };

/** Find a coupon by what the seller typed and check it is usable by them now. */
export async function findUsableCoupon(sellerId: string, input: string): Promise<CouponLookup> {
  const code = normaliseCouponCode(input);
  if (!code) return { ok: false, reason: "That doesn't look like a coupon code." };
  const row = await db.coupon.findUnique({ where: { code }, select: couponSelect });
  if (!row) return { ok: false, reason: "We couldn't find that coupon." };

  const [sellerRedemptions, paidBefore, plan] = await Promise.all([
    db.couponRedemption.count({ where: { couponId: row.id, sellerId } }),
    row.newSellersOnly ? hasPaidBefore(sellerId) : Promise.resolve(false),
    row.planId
      ? db.plan.findUnique({
          where: { id: row.planId },
          select: { id: true, key: true, name: true },
        })
      : Promise.resolve(null),
  ]);
  const usable = checkCouponUsable(row, {
    now: new Date(),
    sellerRedemptions,
    hasPaidBefore: paidBefore,
  });
  if (!usable.ok) return usable;
  return { ok: true, coupon: { ...row, plan } };
}

/** The discount a usable coupon gives on one item, or null when it doesn't apply. */
export function discountForTarget(
  coupon: LoadedCoupon,
  target: CouponTarget,
  baseMinor: number,
  planKey?: string,
): number | null {
  if (!couponAppliesTo(coupon, target, planKey)) return null;
  const discount = discountFor(coupon, baseMinor);
  return discount > 0 ? discount : null;
}

/**
 * Record a successful use inside the caller's transaction. Idempotent per
 * purchase / subscription through the unique columns.
 */
export async function recordRedemption(
  tx: TxClient,
  params: {
    couponId: string;
    sellerId: string;
    purchaseId?: string;
    subscriptionId?: string;
    discountMinor: number;
  },
): Promise<void> {
  const existing = await tx.couponRedemption.findFirst({
    where: params.purchaseId
      ? { purchaseId: params.purchaseId }
      : { subscriptionId: params.subscriptionId ?? "-" },
    select: { id: true },
  });
  if (existing) return;
  await tx.couponRedemption.create({
    data: {
      couponId: params.couponId,
      sellerId: params.sellerId,
      purchaseId: params.purchaseId ?? null,
      subscriptionId: params.subscriptionId ?? null,
      discountMinor: params.discountMinor,
    },
  });
  await tx.coupon.update({
    where: { id: params.couponId },
    data: { redemptionCount: { increment: 1 } },
  });
}

// ── Admin ────────────────────────────────────────────────────────────────────

export function listCouponsForAdmin() {
  return db.coupon.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    take: 200,
    select: {
      ...couponSelect,
      createdAt: true,
      redemptions: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          createdAt: true,
          discountMinor: true,
          seller: { select: { id: true, slug: true, businessName: true } },
        },
      },
    },
  });
}

export type CouponInput = {
  code: string;
  description: string | null;
  kind: "PLAN_PASS" | "PERCENT_OFF" | "FLAT_OFF";
  planId: string | null;
  passMonths: number | null;
  passPriceMinor: number | null;
  percentOff: number | null;
  amountOffMinor: number | null;
  appliesTo: string[];
  planKeys: string[];
  startsAt: Date | null;
  endsAt: Date | null;
  maxRedemptions: number | null;
  perSellerLimit: number;
  newSellersOnly: boolean;
  createdById: string;
};

export async function createCoupon(
  input: CouponInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const row = await db.coupon.create({ data: input, select: { id: true } });
    return { ok: true, id: row.id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "A coupon with that code already exists." };
    }
    throw error;
  }
}

export async function setCouponActive(id: string, isActive: boolean) {
  await db.coupon.update({ where: { id }, data: { isActive } });
}

/** A readable code nobody will guess: BZ-7KQ4X9. */
export function suggestCouponCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `BZ-${out}`;
}
