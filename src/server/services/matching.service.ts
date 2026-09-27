import "server-only";
import { db } from "@/lib/db";
import { rankCandidates, type Candidate, type RankedCandidate } from "@/lib/leads/scoring";
import { chooseSlot, istDayStart, istWeekStart, type LeadSlotName } from "@/lib/leads/quota";
import type { LeadSettings } from "@/lib/validation/lead-settings";

/**
 * Loads the candidate set for a requirement and ranks it (docs/LEADS.md §3).
 *
 * ── Who is a candidate ───────────────────────────────────────────────────────
 * A VERIFIED, non-deleted seller with a SellerCategory in the requirement's
 * category, any of its ancestors, or any of its descendants. Sellers pick
 * categories at whatever depth suits them — "Lighting" or "LED Bulbs" — and a
 * buyer's requirement may sit at either, so the match runs up and down the
 * tree. The direct seller is excluded: they already have the DIRECT lead.
 *
 * ── Delivery quota (D41) ─────────────────────────────────────────────────────
 * A seller whose plan's weekly allowance is used up — and whose "lead of the
 * day" is already taken — is dropped BEFORE ranking, so the requirement goes
 * to the next best seller instead of vanishing. Each survivor carries the
 * slot its lead will use; the fan-out turns that into the expiry.
 *
 * Scoring is pure (src/lib/leads/scoring.ts), and so is the quota rule
 * (src/lib/leads/quota.ts); this file only gathers inputs.
 *
 * The worker imports this file, so it must never pull in `next/*` — the live
 * subscription predicate is inlined rather than imported from plan.service.
 */

export type MatchedSeller = RankedCandidate & { slot: LeadSlotName };

export type MatchInput = {
  categoryId: string;
  locationId: string;
  excludeSellerId: string | null;
};

export async function findMatchedSellers(
  input: MatchInput,
  settings: LeadSettings,
  now = new Date(),
): Promise<MatchedSeller[]> {
  const [category, city] = await Promise.all([
    db.category.findUnique({
      where: { id: input.categoryId },
      select: { id: true, ancestorIds: true },
    }),
    db.location.findUnique({
      where: { id: input.locationId },
      select: { id: true, clusterKey: true },
    }),
  ]);
  if (!category || !city) return [];

  const descendants = await db.category.findMany({
    where: { ancestorIds: { has: category.id } },
    select: { id: true },
  });
  const categoryIds = [category.id, ...category.ancestorIds, ...descendants.map((c) => c.id)];

  const memberships = await db.sellerCategory.findMany({
    where: {
      categoryId: { in: categoryIds },
      seller: {
        status: "VERIFIED",
        deletedAt: null,
        ...(input.excludeSellerId ? { id: { not: input.excludeSellerId } } : {}),
      },
    },
    select: {
      sellerId: true,
      isPrimary: true,
      categoryId: true,
      seller: {
        select: {
          locationId: true,
          responseRate: true,
          location: { select: { clusterKey: true } },
          subscriptions: {
            where: {
              OR: [
                { status: { in: ["ACTIVE", "TRIALING"] } },
                { status: "PAST_DUE", gracePeriodEndsAt: { gt: now } },
              ],
            },
            orderBy: { currentPeriodEnd: "desc" },
            take: 1,
            select: {
              plan: { select: { sortOrder: true, weeklyLeadQuota: true, dailyLeadQuota: true } },
            },
          },
        },
      },
    },
  });

  if (memberships.length === 0) return [];

  // Sellers with no live subscription are on the Free plan's allowance.
  const freePlan = await db.plan.findUnique({
    where: { key: "free" },
    select: { weeklyLeadQuota: true, dailyLeadQuota: true },
  });
  const quotas = new Map<string, { weekly: number | null; daily: number }>();

  // A seller may match through several categories; collapse to one candidate
  // and remember whether ANY of them was their primary in the exact category.
  const bySeller = new Map<string, Candidate>();
  for (const m of memberships) {
    const existing = bySeller.get(m.sellerId);
    const primaryHere = m.isPrimary && m.categoryId === category.id;
    if (existing) {
      existing.primaryCategory = existing.primaryCategory || primaryHere;
      continue;
    }
    const plan = m.seller.subscriptions[0]?.plan;
    quotas.set(m.sellerId, {
      weekly: plan ? plan.weeklyLeadQuota : (freePlan?.weeklyLeadQuota ?? null),
      daily: plan ? plan.dailyLeadQuota : (freePlan?.dailyLeadQuota ?? 0),
    });
    bySeller.set(m.sellerId, {
      sellerId: m.sellerId,
      planTier: m.seller.subscriptions[0]?.plan.sortOrder ?? 0,
      locationId: m.seller.locationId,
      clusterKey: m.seller.location?.clusterKey ?? null,
      servesCity: false,
      responseRate: m.seller.responseRate,
      primaryCategory: primaryHere,
    });
  }

  const serviceAreas = await db.sellerServiceArea.findMany({
    where: { locationId: city.id, sellerId: { in: [...bySeller.keys()] } },
    select: { sellerId: true },
  });
  for (const area of serviceAreas) {
    const candidate = bySeller.get(area.sellerId);
    if (candidate) candidate.servesCity = true;
  }

  // ── Quota: what each seller has already received this week / today ──────
  const weekStart = istWeekStart(now);
  const dayStart = istDayStart(now);
  const received = await db.lead.groupBy({
    by: ["sellerId", "slot"],
    where: {
      sellerId: { in: [...bySeller.keys()] },
      type: "MARKET",
      createdAt: { gte: weekStart },
    },
    _count: { _all: true },
  });
  const dailyToday = await db.lead.groupBy({
    by: ["sellerId"],
    where: {
      sellerId: { in: [...bySeller.keys()] },
      type: "MARKET",
      slot: "DAILY",
      createdAt: { gte: dayStart },
    },
    _count: { _all: true },
  });
  const weeklyUsed = new Map<string, number>();
  for (const row of received) {
    // Leads from before D41 carry no slot; they count against the week.
    if (row.slot === "DAILY") continue;
    weeklyUsed.set(row.sellerId, (weeklyUsed.get(row.sellerId) ?? 0) + row._count._all);
  }
  const dailyUsed = new Map(dailyToday.map((row) => [row.sellerId, row._count._all]));

  const slots = new Map<string, LeadSlotName>();
  const eligible: Candidate[] = [];
  for (const candidate of bySeller.values()) {
    const quota = quotas.get(candidate.sellerId) ?? { weekly: null, daily: 0 };
    const slot = chooseSlot({
      weeklyQuota: quota.weekly,
      dailyQuota: quota.daily,
      weeklyUsed: weeklyUsed.get(candidate.sellerId) ?? 0,
      dailyUsedToday: dailyUsed.get(candidate.sellerId) ?? 0,
    });
    if (!slot) continue;
    slots.set(candidate.sellerId, slot);
    eligible.push(candidate);
  }

  return rankCandidates(
    eligible,
    { locationId: city.id, clusterKey: city.clusterKey },
    settings,
  ).map((candidate) => ({ ...candidate, slot: slots.get(candidate.sellerId) ?? "WEEKLY" }));
}
