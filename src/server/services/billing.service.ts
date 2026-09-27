import "server-only";
import { db, Prisma } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import {
  BILLING_SETTINGS_KEY,
  DEFAULT_BILLING_SETTINGS,
  billingSettingsSchema,
  type BillingSettings,
} from "@/lib/validation/billing-settings";
import { financialYear, formatInvoiceNumber, withGst, type GstAmounts } from "@/lib/billing/gst";
import {
  billingKeyId,
  cancelGatewaySubscription,
  createGatewayOrder,
  createGatewayPlan,
  createGatewaySubscription,
  isBillingGatewayConfigured,
  verifyOrderPayment,
  verifySubscriptionPayment,
  type GatewaySubscription,
} from "@/lib/payments/billing-gateway";
import {
  getActivePlan,
  liveSubscriptionWhere,
  recomputeWebPresence,
} from "@/server/services/plan.service";
import { periodKeyFor, topUpCreditsForPlanChange } from "@/server/services/credit.service";
import type { AddonKind, BillingInterval } from "@/generated/prisma/enums";

/**
 * Sellers paying Bzaro (decision D41).
 *
 * Two money flows, both through Bzaro's own Razorpay account:
 *
 *   Plans    Razorpay Subscriptions. The seller authorises a UPI Autopay /
 *            card / eMandate once; Razorpay charges every month or year. Our
 *            Subscription row is created INCOMPLETE and only becomes ACTIVE
 *            on proof of payment — a verified Checkout signature or a signed
 *            webhook. Every charge becomes a Payment with a GST invoice number.
 *
 *   Add-ons  One-time Razorpay Orders: the ₹499 lead pack, the payment-gateway
 *            add-on and the shipping add-on. A Purchase row is created with the
 *            price copied in; `fulfillPurchase` flips it CREATED → PAID with a
 *            guarded update and applies the effect in the same transaction, so
 *            the browser callback and the webhook can both arrive and only one
 *            of them does anything.
 *
 * Prices are stored exclusive of GST; the rate is a billing setting.
 */

type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

export function getBillingSettings(): Promise<BillingSettings> {
  return getSetting(BILLING_SETTINGS_KEY, billingSettingsSchema, DEFAULT_BILLING_SETTINGS);
}

export function billingGatewayReady(): boolean {
  return isBillingGatewayConfigured();
}

// ── Prices ───────────────────────────────────────────────────────────────────

type PricedPlan = {
  id: string;
  key: string;
  name: string;
  priceMinor: number;
  yearlyPriceMinor: number | null;
};

export function planBasePrice(plan: PricedPlan, interval: "MONTHLY" | "YEARLY"): number | null {
  if (interval === "YEARLY") return plan.yearlyPriceMinor ?? null;
  return plan.priceMinor > 0 ? plan.priceMinor : null;
}

export function quotePlan(
  plan: PricedPlan,
  interval: "MONTHLY" | "YEARLY",
  settings: BillingSettings,
): GstAmounts | null {
  const base = planBasePrice(plan, interval);
  return base ? withGst(base, settings.gstRatePercent) : null;
}

export function addonBasePrice(kind: AddonKind, settings: BillingSettings): number {
  switch (kind) {
    case "LEAD_PACK":
      return settings.leadPackPriceMinor;
    case "PAYMENT_GATEWAY":
      return settings.paymentGatewayAddonMinor;
    case "SHIPPING":
      return settings.shippingAddonMinor;
  }
}

export const ADDON_LABEL: Record<AddonKind, string> = {
  LEAD_PACK: "Lead pack",
  PAYMENT_GATEWAY: "Payment gateway & Add to cart",
  SHIPPING: "Shipping integration",
};

// ── Invoice numbers ──────────────────────────────────────────────────────────

/** Next sequential number for the financial year, atomically. */
export async function nextInvoiceNumber(tx: TxClient, prefix: string | null, at = new Date()) {
  const fy = financialYear(at);
  const rows = await tx.$queryRaw<Array<{ seq: number }>>`
    INSERT INTO "InvoiceCounter" ("fy", "next") VALUES (${fy}, 2)
    ON CONFLICT ("fy") DO UPDATE SET "next" = "InvoiceCounter"."next" + 1
    RETURNING ("next" - 1)::int AS seq`;
  return formatInvoiceNumber(prefix ?? "BZ", fy, rows[0]?.seq ?? 1);
}

// ── What a seller may buy right now ──────────────────────────────────────────

export type AddonOffer = {
  kind: AddonKind;
  label: string;
  quote: GstAmounts;
  credits?: number;
  available: boolean;
  /** Why not, when unavailable — shown under the disabled button. */
  reason: string | null;
  owned: boolean;
};

export async function getAddonOffers(sellerId: string): Promise<AddonOffer[]> {
  const [settings, subscription, seller, feature] = await Promise.all([
    getBillingSettings(),
    getActivePlan(sellerId),
    db.seller.findUnique({ where: { id: sellerId }, select: { creditBalance: true } }),
    db.sellerFeature.findUnique({
      where: { sellerId },
      select: { paymentsEnabled: true, shippingEnabled: true },
    }),
  ]);
  const plan = subscription?.plan;
  const planKey = plan?.key ?? "free";
  const hasWebsite = (plan?.webPresence ?? "CATALOGUE") !== "CATALOGUE";
  const paymentsOwned = Boolean(plan?.includesPayments || feature?.paymentsEnabled);
  const shippingOwned = Boolean(plan?.includesShipping || feature?.shippingEnabled);
  const credits = seller?.creditBalance ?? 0;

  const leadPackOpen = planKey === "free" || credits <= 0;
  return [
    {
      kind: "LEAD_PACK",
      label: `${settings.leadPackCredits} lead credits`,
      quote: withGst(settings.leadPackPriceMinor, settings.gstRatePercent),
      credits: settings.leadPackCredits,
      available: leadPackOpen,
      reason: leadPackOpen ? null : "Available once your plan's credits are used up.",
      owned: false,
    },
    {
      kind: "PAYMENT_GATEWAY",
      label: ADDON_LABEL.PAYMENT_GATEWAY,
      quote: withGst(settings.paymentGatewayAddonMinor, settings.gstRatePercent),
      available: hasWebsite && !paymentsOwned,
      reason: paymentsOwned
        ? plan?.includesPayments
          ? "Included in your plan."
          : "Already active."
        : hasWebsite
          ? null
          : "Needs a plan with a website (Pro or Gold).",
      owned: paymentsOwned,
    },
    {
      kind: "SHIPPING",
      label: ADDON_LABEL.SHIPPING,
      quote: withGst(settings.shippingAddonMinor, settings.gstRatePercent),
      available: hasWebsite && paymentsOwned && !shippingOwned,
      reason: shippingOwned
        ? plan?.includesShipping
          ? "Included in your plan."
          : "Already active."
        : !hasWebsite
          ? "Needs a plan with a website (Pro or Gold)."
          : !paymentsOwned
            ? "Add the payment gateway first — shipping needs online orders."
            : null,
      owned: shippingOwned,
    },
  ];
}

// ── Plan checkout ────────────────────────────────────────────────────────────

export type CheckoutPayload = {
  keyId: string;
  /** Razorpay subscription id (plans) or order id (add-ons). */
  subscriptionId?: string;
  orderId?: string;
  purchaseId?: string;
  amountMinor: number;
  name: string;
  description: string;
};

export type CheckoutStart = { ok: true; payload: CheckoutPayload } | { ok: false; error: string };

const TOTAL_CYCLES: Record<"MONTHLY" | "YEARLY", number> = { MONTHLY: 120, YEARLY: 10 };

/**
 * The Razorpay plan id for (plan, interval, amount). Stored as "id@amount" so
 * a price or GST change creates a fresh gateway plan instead of charging the
 * old amount — Razorpay plans are immutable.
 */
async function ensureGatewayPlan(
  plan: PricedPlan & { gatewayPlanIdMonthly: string | null; gatewayPlanIdYearly: string | null },
  interval: "MONTHLY" | "YEARLY",
  totalMinor: number,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const stored = interval === "YEARLY" ? plan.gatewayPlanIdYearly : plan.gatewayPlanIdMonthly;
  const [storedId, storedAmount] = (stored ?? "").split("@");
  if (storedId && Number(storedAmount) === totalMinor) return { ok: true, id: storedId };

  const created = await createGatewayPlan({
    period: interval === "YEARLY" ? "yearly" : "monthly",
    name: `Bzaro ${plan.name} (${interval === "YEARLY" ? "yearly" : "monthly"})`,
    amountMinor: totalMinor,
    description: `Bzaro ${plan.name} plan, GST included`,
    notes: { bzaroPlanId: plan.id, bzaroPlanKey: plan.key },
  });
  if (!created.ok) return { ok: false, error: created.error };

  const value = `${created.data.id}@${totalMinor}`;
  await db.plan.update({
    where: { id: plan.id },
    data: interval === "YEARLY" ? { gatewayPlanIdYearly: value } : { gatewayPlanIdMonthly: value },
  });
  return { ok: true, id: created.data.id };
}

export async function startPlanCheckout(params: {
  sellerId: string;
  userId: string;
  planKey: string;
  interval: "MONTHLY" | "YEARLY";
}): Promise<CheckoutStart> {
  if (!isBillingGatewayConfigured()) {
    return {
      ok: false,
      error: "Online payment is not switched on yet. Use the manual option below.",
    };
  }
  const plan = await db.plan.findUnique({
    where: { key: params.planKey },
    select: {
      id: true,
      key: true,
      name: true,
      isActive: true,
      priceMinor: true,
      yearlyPriceMinor: true,
      gatewayPlanIdMonthly: true,
      gatewayPlanIdYearly: true,
    },
  });
  if (!plan?.isActive) return { ok: false, error: "That plan is not available." };

  const settings = await getBillingSettings();
  const quote = quotePlan(plan, params.interval, settings);
  if (!quote) return { ok: false, error: "That billing period is not offered for this plan." };

  const current = await getActivePlan(params.sellerId);
  if (
    current?.plan.id === plan.id &&
    current.interval === params.interval &&
    current.gatewaySubscriptionId &&
    !current.cancelAtPeriodEnd
  ) {
    return { ok: false, error: `You are already on ${plan.name}.` };
  }

  const gatewayPlan = await ensureGatewayPlan(plan, params.interval, quote.totalMinor);
  if (!gatewayPlan.ok) return { ok: false, error: `Razorpay: ${gatewayPlan.error}` };

  // Row first, so the webhook can always find it by the gateway id.
  const row = await db.subscription.create({
    data: {
      sellerId: params.sellerId,
      planId: plan.id,
      status: "INCOMPLETE",
      interval: params.interval,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(),
    },
    select: { id: true },
  });

  const created = await createGatewaySubscription({
    planId: gatewayPlan.id,
    totalCount: TOTAL_CYCLES[params.interval],
    notes: { bzaroSubscriptionId: row.id, sellerId: params.sellerId, planKey: plan.key },
  });
  if (!created.ok) {
    await db.subscription.update({ where: { id: row.id }, data: { status: "EXPIRED" } });
    return { ok: false, error: `Razorpay: ${created.error}` };
  }

  await db.subscription.update({
    where: { id: row.id },
    data: { gatewaySubscriptionId: created.data.id, gatewayStatus: created.data.status },
  });
  await db.auditLog.create({
    data: {
      actorId: params.userId,
      sellerId: params.sellerId,
      action: "billing.subscription_started",
      entityType: "Subscription",
      entityId: row.id,
      after: { plan: plan.key, interval: params.interval, totalMinor: quote.totalMinor },
    },
  });

  return {
    ok: true,
    payload: {
      keyId: billingKeyId() ?? "",
      subscriptionId: created.data.id,
      amountMinor: quote.totalMinor,
      name: "Bzaro",
      description: `${plan.name} · ${params.interval === "YEARLY" ? "yearly" : "monthly"} (incl. GST)`,
    },
  };
}

/** Browser callback after the mandate is authorised. Signature is the proof. */
export async function confirmPlanCheckout(params: {
  sellerId: string;
  subscriptionId: string;
  paymentId: string;
  signature: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isBillingGatewayConfigured()) return { ok: false, error: "Billing is not configured." };
  const row = await db.subscription.findUnique({
    where: { gatewaySubscriptionId: params.subscriptionId },
    select: { sellerId: true },
  });
  if (!row || row.sellerId !== params.sellerId)
    return { ok: false, error: "Unknown subscription." };
  if (
    !verifySubscriptionPayment({
      subscriptionId: params.subscriptionId,
      paymentId: params.paymentId,
      signature: params.signature,
    })
  ) {
    return { ok: false, error: "Payment could not be verified." };
  }
  await activateGatewaySubscription(params.subscriptionId, null);
  return { ok: true };
}

function periodFrom(entity: GatewaySubscription | null, interval: BillingInterval, now: Date) {
  const start = entity?.current_start ? new Date(entity.current_start * 1000) : now;
  const fallbackEnd = new Date(start);
  if (interval === "YEARLY") fallbackEnd.setUTCFullYear(fallbackEnd.getUTCFullYear() + 1);
  else fallbackEnd.setUTCMonth(fallbackEnd.getUTCMonth() + 1);
  const end = entity?.current_end ? new Date(entity.current_end * 1000) : fallbackEnd;
  return { start, end };
}

/**
 * INCOMPLETE → ACTIVE, ending whatever plan the seller had before. Idempotent:
 * a second call only refreshes the period from the gateway entity.
 */
export async function activateGatewaySubscription(
  gatewaySubscriptionId: string,
  entity: GatewaySubscription | null,
): Promise<void> {
  const now = new Date();
  const result = await db.$transaction(async (tx) => {
    const sub = await tx.subscription.findUnique({
      where: { gatewaySubscriptionId },
      select: {
        id: true,
        sellerId: true,
        status: true,
        interval: true,
        plan: { select: { key: true, leadCreditsPerMonth: true } },
      },
    });
    if (!sub) return null;
    const period = periodFrom(entity, sub.interval, now);

    if (sub.status !== "INCOMPLETE") {
      if (entity?.current_end && ["ACTIVE", "PAST_DUE"].includes(sub.status)) {
        await tx.subscription.update({
          where: { id: sub.id },
          data: {
            currentPeriodStart: period.start,
            currentPeriodEnd: period.end,
            gatewayStatus: entity.status,
          },
        });
      }
      return { ...sub, activated: false, previousGatewayIds: [] as string[] };
    }

    const previous = await tx.subscription.findMany({
      where: { sellerId: sub.sellerId, id: { not: sub.id }, ...liveSubscriptionWhere(now) },
      select: { id: true, gatewaySubscriptionId: true },
    });
    if (previous.length > 0) {
      await tx.subscription.updateMany({
        where: { id: { in: previous.map((p) => p.id) } },
        data: { status: "CANCELED", canceledAt: now, cancelAtPeriodEnd: false },
      });
    }
    await tx.subscription.update({
      where: { id: sub.id },
      data: {
        status: "ACTIVE",
        currentPeriodStart: period.start,
        currentPeriodEnd: period.end,
        gracePeriodEndsAt: null,
        gatewayStatus: entity?.status ?? "active",
      },
    });
    await tx.auditLog.create({
      data: {
        sellerId: sub.sellerId,
        action: "billing.subscription_activated",
        entityType: "Subscription",
        entityId: sub.id,
        after: { plan: sub.plan.key, interval: sub.interval },
      },
    });
    return {
      ...sub,
      activated: true,
      previousGatewayIds: previous
        .map((p) => p.gatewaySubscriptionId)
        .filter((id): id is string => Boolean(id)),
    };
  });
  if (!result?.activated) return;

  // Outside the transaction: network calls and cache purges.
  for (const id of result.previousGatewayIds) {
    await cancelGatewaySubscription(id, false).catch(() => undefined);
  }
  await recomputeWebPresence(result.sellerId);
  await topUpCreditsForPlanChange({
    sellerId: result.sellerId,
    subscriptionId: result.id,
    monthlyCredits: result.plan.leadCreditsPerMonth,
    periodKey: periodKeyFor(now),
  });
}

/** A successful charge (first or renewal): Payment + invoice, period moves on. */
export async function recordSubscriptionCharge(params: {
  gatewaySubscriptionId: string;
  paymentId: string;
  amountMinor: number;
  entity: GatewaySubscription | null;
}): Promise<void> {
  const settings = await getBillingSettings();
  const sub = await db.subscription.findUnique({
    where: { gatewaySubscriptionId: params.gatewaySubscriptionId },
    select: { id: true, sellerId: true, status: true, interval: true },
  });
  if (!sub) return;
  if (sub.status === "INCOMPLETE")
    await activateGatewaySubscription(params.gatewaySubscriptionId, params.entity);

  const baseMinor = Math.round(params.amountMinor / (1 + settings.gstRatePercent / 100));
  try {
    await db.$transaction(async (tx) => {
      const invoiceNumber = await nextInvoiceNumber(tx, settings.invoicePrefix);
      await tx.payment.create({
        data: {
          subscriptionId: sub.id,
          sellerId: sub.sellerId,
          amountMinor: params.amountMinor,
          baseMinor,
          taxMinor: params.amountMinor - baseMinor,
          status: "captured",
          gatewayPaymentId: params.paymentId,
          invoiceNumber,
          paidAt: new Date(),
        },
      });
      const period = periodFrom(params.entity, sub.interval, new Date());
      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          status: "ACTIVE",
          gracePeriodEndsAt: null,
          ...(params.entity?.current_end
            ? { currentPeriodStart: period.start, currentPeriodEnd: period.end }
            : {}),
          gatewayStatus: params.entity?.status ?? "active",
        },
      });
    });
  } catch (error) {
    // Same payment delivered twice (webhook retry): the unique id says so.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return;
    throw error;
  }
  await recomputeWebPresence(sub.sellerId);
}

/** A renewal failed; Razorpay keeps retrying. Features stay on for graceDays. */
export async function markSubscriptionPastDue(
  gatewaySubscriptionId: string,
  gatewayStatus: string,
) {
  const settings = await getBillingSettings();
  const sub = await db.subscription.findUnique({
    where: { gatewaySubscriptionId },
    select: { id: true, sellerId: true, status: true, gracePeriodEndsAt: true },
  });
  if (!sub || !["ACTIVE", "PAST_DUE"].includes(sub.status)) return;
  await db.subscription.update({
    where: { id: sub.id },
    data: {
      status: "PAST_DUE",
      gatewayStatus,
      gracePeriodEndsAt:
        sub.gracePeriodEndsAt ?? new Date(Date.now() + settings.graceDays * 86_400_000),
    },
  });
  await recomputeWebPresence(sub.sellerId);
}

/** Cancelled (by the seller, us, or the gateway) or all cycles completed. */
export async function endGatewaySubscription(
  gatewaySubscriptionId: string,
  status: "CANCELED" | "EXPIRED",
  gatewayStatus: string,
) {
  const sub = await db.subscription.findUnique({
    where: { gatewaySubscriptionId },
    select: { id: true, sellerId: true, status: true },
  });
  if (!sub || sub.status === "CANCELED" || sub.status === "EXPIRED") return;
  await db.subscription.update({
    where: { id: sub.id },
    data: { status, gatewayStatus, canceledAt: new Date() },
  });
  await recomputeWebPresence(sub.sellerId);
}

/** Seller: stop renewing. The plan stays until the end of the paid period. */
export async function cancelPlanAtPeriodEnd(params: { sellerId: string; userId: string }) {
  const current = await getActivePlan(params.sellerId);
  if (!current) return { ok: false as const, error: "You are on the Free plan." };
  if (current.gatewaySubscriptionId) {
    const result = await cancelGatewaySubscription(current.gatewaySubscriptionId, true);
    if (!result.ok) return { ok: false as const, error: `Razorpay: ${result.error}` };
  }
  await db.subscription.update({
    where: { id: current.id },
    data: { cancelAtPeriodEnd: true },
  });
  await db.auditLog.create({
    data: {
      actorId: params.userId,
      sellerId: params.sellerId,
      action: "billing.subscription_cancel_requested",
      entityType: "Subscription",
      entityId: current.id,
    },
  });
  return { ok: true as const, endsAt: current.currentPeriodEnd };
}

// ── Add-on checkout ──────────────────────────────────────────────────────────

export async function startAddonCheckout(params: {
  sellerId: string;
  userId: string;
  kind: AddonKind;
}): Promise<CheckoutStart> {
  if (!isBillingGatewayConfigured()) {
    return {
      ok: false,
      error: "Online payment is not switched on yet. Please contact us to buy this.",
    };
  }
  const offers = await getAddonOffers(params.sellerId);
  const offer = offers.find((o) => o.kind === params.kind);
  if (!offer?.available) return { ok: false, error: offer?.reason ?? "Not available." };

  const settings = await getBillingSettings();
  const purchase = await db.purchase.create({
    data: {
      sellerId: params.sellerId,
      kind: params.kind,
      quantity: params.kind === "LEAD_PACK" ? settings.leadPackCredits : 1,
      baseMinor: offer.quote.baseMinor,
      taxMinor: offer.quote.taxMinor,
      totalMinor: offer.quote.totalMinor,
      actorId: params.userId,
    },
    select: { id: true },
  });

  const order = await createGatewayOrder({
    amountMinor: offer.quote.totalMinor,
    receipt: purchase.id,
    notes: { purchaseId: purchase.id, sellerId: params.sellerId, kind: params.kind },
  });
  if (!order.ok) {
    await db.purchase.update({ where: { id: purchase.id }, data: { status: "FAILED" } });
    return { ok: false, error: `Razorpay: ${order.error}` };
  }
  await db.purchase.update({
    where: { id: purchase.id },
    data: { gatewayOrderId: order.data.id },
  });

  return {
    ok: true,
    payload: {
      keyId: billingKeyId() ?? "",
      orderId: order.data.id,
      purchaseId: purchase.id,
      amountMinor: offer.quote.totalMinor,
      name: "Bzaro",
      description: `${offer.label} (incl. GST)`,
    },
  };
}

export async function confirmAddonCheckout(params: {
  sellerId: string;
  purchaseId: string;
  orderId: string;
  paymentId: string;
  signature: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isBillingGatewayConfigured()) return { ok: false, error: "Billing is not configured." };
  const purchase = await db.purchase.findUnique({
    where: { id: params.purchaseId },
    select: { sellerId: true, gatewayOrderId: true },
  });
  if (
    !purchase ||
    purchase.sellerId !== params.sellerId ||
    purchase.gatewayOrderId !== params.orderId
  ) {
    return { ok: false, error: "Unknown purchase." };
  }
  if (
    !verifyOrderPayment({
      orderId: params.orderId,
      paymentId: params.paymentId,
      signature: params.signature,
    })
  ) {
    return { ok: false, error: "Payment could not be verified." };
  }
  await fulfillPurchase(params.purchaseId, params.paymentId);
  return { ok: true };
}

/**
 * CREATED → PAID and apply the effect, once. The guarded updateMany is the
 * lock: a duplicate callback or webhook matches zero rows and stops there.
 */
export async function fulfillPurchase(purchaseId: string, paymentId: string): Promise<boolean> {
  const settings = await getBillingSettings();
  try {
    return await db.$transaction(async (tx) => {
      const claimed = await tx.purchase.updateMany({
        where: { id: purchaseId, status: { in: ["CREATED", "FAILED"] } },
        data: { status: "PAID", gatewayPaymentId: paymentId, paidAt: new Date() },
      });
      if (claimed.count !== 1) return false;

      const purchase = await tx.purchase.findUniqueOrThrow({
        where: { id: purchaseId },
        select: { id: true, sellerId: true, kind: true, quantity: true, actorId: true },
      });
      const invoiceNumber = await nextInvoiceNumber(tx, settings.invoicePrefix);
      await tx.purchase.update({ where: { id: purchase.id }, data: { invoiceNumber } });

      if (purchase.kind === "LEAD_PACK") {
        const seller = await tx.seller.update({
          where: { id: purchase.sellerId },
          data: { creditBalance: { increment: purchase.quantity } },
          select: { creditBalance: true },
        });
        await tx.creditLedger.create({
          data: {
            sellerId: purchase.sellerId,
            delta: purchase.quantity,
            balanceAfter: seller.creditBalance,
            reason: "ADDON_PURCHASE",
            note: `Lead pack ${invoiceNumber}`,
            actorId: purchase.actorId,
          },
        });
      } else {
        const data =
          purchase.kind === "PAYMENT_GATEWAY"
            ? { paymentsEnabled: true }
            : { shippingEnabled: true };
        await tx.sellerFeature.upsert({
          where: { sellerId: purchase.sellerId },
          create: { sellerId: purchase.sellerId, ...data, source: "ADDON", note: invoiceNumber },
          update: { ...data, source: "ADDON", note: invoiceNumber },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: purchase.actorId,
          sellerId: purchase.sellerId,
          action: "billing.addon_paid",
          entityType: "Purchase",
          entityId: purchase.id,
          after: { kind: purchase.kind, quantity: purchase.quantity, invoiceNumber },
        },
      });
      return true;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return false;
    throw error;
  }
}

export async function fulfillPurchaseByOrder(orderId: string, paymentId: string): Promise<boolean> {
  const purchase = await db.purchase.findUnique({
    where: { gatewayOrderId: orderId },
    select: { id: true },
  });
  return purchase ? fulfillPurchase(purchase.id, paymentId) : false;
}

// ── History ──────────────────────────────────────────────────────────────────

export async function getBillingHistory(sellerId: string) {
  const [payments, purchases] = await Promise.all([
    db.payment.findMany({
      where: { sellerId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        amountMinor: true,
        refundedMinor: true,
        status: true,
        invoiceNumber: true,
        paidAt: true,
        createdAt: true,
        subscription: { select: { interval: true, plan: { select: { name: true } } } },
        refunds: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { status: true, createdAt: true, adminNote: true },
        },
      },
    }),
    db.purchase.findMany({
      where: { sellerId, status: { in: ["PAID", "REFUNDED"] } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        kind: true,
        quantity: true,
        totalMinor: true,
        status: true,
        invoiceNumber: true,
        paidAt: true,
        createdAt: true,
      },
    }),
  ]);
  return { payments, purchases };
}
