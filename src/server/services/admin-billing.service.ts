import "server-only";
import { db } from "@/lib/db";
import type { Prisma, SubStatus, WebPresence } from "@/generated/prisma/client";
import { liveSubscriptionWhere, recomputeWebPresence } from "@/server/services/plan.service";

/**
 * Admin billing: the plan table and every seller's subscription.
 *
 * Plans are data (D5, D32): editing a quota, a credit grant or the
 * web-presence tier here is live for new evaluations immediately. Sellers
 * already on a plan whose `webPresence` changed are recomputed in the same
 * request — a plan edit is exactly the "subscription write" that rule cares
 * about.
 */

// ── Plans ────────────────────────────────────────────────────────────────────

export function listPlansForAdmin() {
  return db.plan.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      key: true,
      name: true,
      description: true,
      priceMinor: true,
      currency: true,
      interval: true,
      trialDays: true,
      maxProducts: true,
      maxServices: true,
      maxGalleryItems: true,
      maxCategories: true,
      leadCreditsPerMonth: true,
      webPresence: true,
      allowPremiumTemplates: true,
      removeBranding: true,
      prioritySupport: true,
      searchBoost: true,
      isActive: true,
      sortOrder: true,
      _count: { select: { subscriptions: { where: liveSubscriptionWhere() } } },
    },
  });
}

export type PlanInput = {
  key: string;
  name: string;
  description: string | null;
  priceMinor: number;
  interval: "MONTHLY" | "QUARTERLY" | "YEARLY";
  maxProducts: number;
  maxServices: number;
  maxGalleryItems: number;
  maxCategories: number;
  leadCreditsPerMonth: number | null;
  webPresence: WebPresence;
  allowPremiumTemplates: boolean;
  removeBranding: boolean;
  prioritySupport: boolean;
  searchBoost: number;
  isActive: boolean;
  sortOrder: number;
};

export async function upsertPlan(id: string | null, input: PlanInput) {
  const data = { ...input, currency: "INR" };
  const plan = id
    ? await db.plan.update({ where: { id }, data, select: { id: true } })
    : await db.plan.create({ data, select: { id: true } });

  // The tier follows the plan (D32). Sequential on purpose: a popular plan
  // means hundreds of rows, and nothing waits on this but the admin.
  const subscribers = await db.subscription.findMany({
    where: { planId: plan.id, ...liveSubscriptionWhere() },
    select: { sellerId: true },
  });
  for (const row of subscribers) await recomputeWebPresence(row.sellerId, db, "immediate");

  return plan;
}

// ── Subscriptions ────────────────────────────────────────────────────────────

export type SubscriptionFilters = {
  plan?: string;
  status?: SubStatus;
  q?: string;
  page?: number;
};

const PAGE_SIZE = 30;

export async function listSubscriptionsForAdmin(filters: SubscriptionFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const where: Prisma.SubscriptionWhereInput = {
    ...(filters.plan ? { plan: { key: filters.plan } } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.q
      ? {
          seller: {
            OR: [
              { businessName: { contains: filters.q, mode: "insensitive" } },
              { slug: { contains: filters.q, mode: "insensitive" } },
            ],
          },
        }
      : {}),
    // One row per seller: the live subscription, or the most recent one.
    OR: [liveSubscriptionWhere(), { seller: { subscriptions: { none: liveSubscriptionWhere() } } }],
  };

  const [items, total, plans] = await Promise.all([
    db.subscription.findMany({
      where,
      orderBy: [{ currentPeriodEnd: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        status: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        gracePeriodEndsAt: true,
        plan: { select: { key: true, name: true, webPresence: true } },
        seller: {
          select: {
            id: true,
            slug: true,
            businessName: true,
            status: true,
            webPresence: true,
            creditBalance: true,
          },
        },
      },
    }),
    db.subscription.count({ where }),
    db.plan.findMany({ orderBy: { sortOrder: "asc" }, select: { key: true, name: true } }),
  ]);

  return { items, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)), plans };
}

/** Sellers who clicked "Notify the Bzaro team" on the upgrade page, newest first. */
export async function listUpgradeRequests(limit = 20) {
  const rows = await db.auditLog.findMany({
    where: { action: "subscription.upgrade_requested" },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      createdAt: true,
      after: true,
      sellerId: true,
    },
  });
  const sellerIds = [...new Set(rows.map((row) => row.sellerId).filter(Boolean))] as string[];
  const sellers = await db.seller.findMany({
    where: { id: { in: sellerIds } },
    select: {
      id: true,
      slug: true,
      businessName: true,
      subscriptions: {
        where: liveSubscriptionWhere(),
        orderBy: { currentPeriodEnd: "desc" },
        take: 1,
        select: { plan: { select: { key: true, name: true } } },
      },
    },
  });
  const byId = new Map(sellers.map((seller) => [seller.id, seller]));
  return rows.flatMap((row) => {
    const seller = row.sellerId ? byId.get(row.sellerId) : undefined;
    if (!seller) return [];
    const wanted = (row.after as { plan?: string } | null)?.plan ?? null;
    const current = seller.subscriptions[0]?.plan.key ?? "free";
    return [
      {
        id: row.id,
        createdAt: row.createdAt,
        seller: { id: seller.id, slug: seller.slug, businessName: seller.businessName },
        wanted,
        current,
        // Still open while the seller is not yet on the plan they asked for.
        open: wanted !== null && wanted !== current,
      },
    ];
  });
}
