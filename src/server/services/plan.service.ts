import "server-only";
import { db } from "@/lib/db";
import type { Prisma, WebPresence } from "@/generated/prisma/client";
import { revalidateTenant, type RevalidateMode } from "@/lib/cache/revalidate";
import { revalidateTag } from "next/cache";
import { cacheTags } from "@/lib/cache/tags";
import { periodKeyFor, topUpCreditsForPlanChange } from "@/server/services/credit.service";

/**
 * Plans, subscriptions and the web-presence tier (decision D32).
 *
 * ── One rule for "which subscription counts" ────────────────────────────────
 * ACTIVE or TRIALING, or PAST_DUE inside its grace period. Every entitlement
 * on the platform should derive from this predicate; the leads code predates
 * it and still inlines `["ACTIVE", "TRIALING"]`, which is equivalent until a
 * payment gateway starts producing PAST_DUE rows.
 *
 * ── Web presence is denormalised ────────────────────────────────────────────
 * `Seller.webPresence` is read on every microsite request and every canonical
 * URL, so it is a column, not a join. It is recomputed here on every
 * subscription write and swept nightly (`recompute-web-presence`) so a
 * subscription that lapses without a request touching it still downgrades.
 */

type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

export const WEB_PRESENCE_RANK: Record<WebPresence, number> = {
  CATALOGUE: 0,
  SUBDOMAIN: 1,
  CUSTOM_DOMAIN: 2,
};

export function liveSubscriptionWhere(now = new Date()): Prisma.SubscriptionWhereInput {
  return {
    OR: [
      { status: { in: ["ACTIVE", "TRIALING"] } },
      { status: "PAST_DUE", gracePeriodEndsAt: { gt: now } },
    ],
  };
}

/** The plan a seller is currently entitled to, or null (treated as Free). */
export async function getActivePlan(sellerId: string, client: TxClient | typeof db = db) {
  const subscription = await client.subscription.findFirst({
    where: { sellerId, ...liveSubscriptionWhere() },
    orderBy: { currentPeriodEnd: "desc" },
    select: {
      id: true,
      status: true,
      currentPeriodEnd: true,
      gracePeriodEndsAt: true,
      plan: {
        select: {
          id: true,
          key: true,
          name: true,
          priceMinor: true,
          currency: true,
          interval: true,
          webPresence: true,
          leadCreditsPerMonth: true,
          maxProducts: true,
          removeBranding: true,
          allowPremiumTemplates: true,
          sortOrder: true,
        },
      },
    },
  });
  return subscription;
}

/**
 * Recompute `Seller.webPresence` from the live subscription. Returns the new
 * value and whether it changed; on change the tenant cache is purged so the
 * subdomain starts (or stops) serving immediately.
 */
export async function recomputeWebPresence(
  sellerId: string,
  client: TxClient | typeof db = db,
  /** "immediate" from a Server Action (the admin sees the change on the next
   *  request); "background" from jobs, which cannot call updateTag. */
  mode: RevalidateMode = "background",
): Promise<{ webPresence: WebPresence; changed: boolean }> {
  const [seller, subscription] = await Promise.all([
    client.seller.findUnique({
      where: { id: sellerId },
      select: { slug: true, webPresence: true },
    }),
    getActivePlan(sellerId, client),
  ]);
  if (!seller) return { webPresence: "CATALOGUE", changed: false };

  const next: WebPresence = subscription?.plan.webPresence ?? "CATALOGUE";
  if (next === seller.webPresence) return { webPresence: next, changed: false };

  await client.seller.update({ where: { id: sellerId }, data: { webPresence: next } });
  revalidateTenant(seller.slug, mode);
  revalidateTag(cacheTags.sitemap(), "max");
  return { webPresence: next, changed: true };
}

/** Public plan ladder for /pricing and the dashboard upgrade card. */
export function listPublicPlans() {
  return db.plan.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      key: true,
      name: true,
      description: true,
      priceMinor: true,
      currency: true,
      interval: true,
      maxProducts: true,
      maxServices: true,
      maxGalleryItems: true,
      maxCategories: true,
      leadCreditsPerMonth: true,
      webPresence: true,
      allowPremiumTemplates: true,
      removeBranding: true,
      prioritySupport: true,
      sortOrder: true,
    },
  });
}

/** The seller's most recent "notify the team" click, for the billing page. */
export function getLastUpgradeRequest(sellerId: string) {
  return db.auditLog.findFirst({
    where: { sellerId, action: "subscription.upgrade_requested" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, after: true },
  });
}

/**
 * Put a seller on a plan (admin). Ends the current live subscription and
 * starts a new period today. Until a payment gateway exists this is the only
 * way a plan changes, so it is deliberately simple: no proration, no
 * scheduling — the admin is the gateway.
 */
export async function changeSellerPlan(params: {
  sellerId: string;
  planId: string;
  actorId: string;
  periodDays?: number;
}) {
  const now = new Date();
  const periodDays = params.periodDays ?? 30;

  const result = await db.$transaction(async (tx) => {
    const plan = await tx.plan.findUnique({
      where: { id: params.planId },
      select: { id: true, key: true, name: true, isActive: true },
    });
    if (!plan || !plan.isActive) throw new Error("Unknown or inactive plan");

    const previous = await getActivePlan(params.sellerId, tx);
    if (previous?.plan.id === plan.id) {
      return { plan, previousPlanKey: previous.plan.key, changed: false as const };
    }

    if (previous) {
      await tx.subscription.update({
        where: { id: previous.id },
        data: { status: "CANCELED", canceledAt: now, cancelAtPeriodEnd: false },
      });
    }

    const subscription = await tx.subscription.create({
      data: {
        sellerId: params.sellerId,
        planId: plan.id,
        status: "ACTIVE",
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + periodDays * 24 * 3600 * 1000),
      },
      select: { id: true, plan: { select: { leadCreditsPerMonth: true } } },
    });

    await tx.auditLog.create({
      data: {
        actorId: params.actorId,
        sellerId: params.sellerId,
        action: "subscription.plan_changed",
        entityType: "Seller",
        entityId: params.sellerId,
        before: { plan: previous?.plan.key ?? null },
        after: { plan: plan.key },
      },
    });

    return {
      plan,
      previousPlanKey: previous?.plan.key ?? null,
      changed: true as const,
      subscription,
    };
  });

  if (result.changed) {
    await recomputeWebPresence(params.sellerId, db, "immediate");
    // Credits for the current month, now — not on the 1st (see credit.service).
    await topUpCreditsForPlanChange({
      sellerId: params.sellerId,
      subscriptionId: result.subscription.id,
      monthlyCredits: result.subscription.plan.leadCreditsPerMonth,
      periodKey: periodKeyFor(now),
    });
  }
  return result;
}

/** Nightly sweep: every live seller, so a lapsed subscription downgrades. */
export async function recomputeAllWebPresence(): Promise<{ scanned: number; changed: number }> {
  const sellers = await db.seller.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });
  let changed = 0;
  // Sequential on purpose — nightly, nothing waits on it.
  for (const seller of sellers) {
    const result = await recomputeWebPresence(seller.id);
    if (result.changed) changed += 1;
  }
  return { scanned: sellers.length, changed };
}
