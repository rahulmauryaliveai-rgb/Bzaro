import "server-only";
import { db } from "@/lib/db";
import { rankCandidates, type Candidate, type RankedCandidate } from "@/lib/leads/scoring";
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
 * Scoring is pure (src/lib/leads/scoring.ts); this file only gathers inputs.
 */

export type MatchInput = {
  categoryId: string;
  locationId: string;
  excludeSellerId: string | null;
};

export async function findMatchedSellers(
  input: MatchInput,
  settings: LeadSettings,
): Promise<RankedCandidate[]> {
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
            where: { status: { in: ["ACTIVE", "TRIALING"] } },
            orderBy: { currentPeriodEnd: "desc" },
            take: 1,
            select: { plan: { select: { sortOrder: true } } },
          },
        },
      },
    },
  });

  if (memberships.length === 0) return [];

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

  return rankCandidates(
    [...bySeller.values()],
    { locationId: city.id, clusterKey: city.clusterKey },
    settings,
  );
}
