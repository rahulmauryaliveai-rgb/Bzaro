import type { LeadSettings } from "@/lib/validation/lead-settings";

/**
 * Market-lead matching score (docs/LEADS.md §3). Pure, so the ranking that
 * decides who gets a paid lead is unit-tested without a database.
 *
 * Signals, highest weight first:
 *   plan tier      — the one lever the seller pays for
 *   city           — same city > same metro cluster > serves the city
 *   response rate  — how often this seller accepts market leads
 *   primary        — the requirement is in the seller's PRIMARY category
 *
 * City signals are tiered, not summed: a seller earns the best one only.
 */

export type Candidate = {
  sellerId: string;
  /** Plan.sortOrder: Free 0, Basic 1, Gold 2. */
  planTier: number;
  locationId: string | null;
  clusterKey: string | null;
  servesCity: boolean;
  /** Null = no history → neutral default. */
  responseRate: number | null;
  primaryCategory: boolean;
};

export type MatchContext = {
  locationId: string;
  clusterKey: string | null;
};

export function scoreCandidate(
  candidate: Candidate,
  context: MatchContext,
  settings: LeadSettings,
): number {
  const { weights } = settings;
  let score = weights.planTier * candidate.planTier;

  if (candidate.locationId === context.locationId) {
    score += weights.sameCity;
  } else if (context.clusterKey && candidate.clusterKey === context.clusterKey) {
    score += weights.sameCluster;
  } else if (candidate.servesCity) {
    score += weights.servesCity;
  }

  const responseRate = candidate.responseRate ?? settings.neutralResponseRate;
  score += Math.round(weights.responseRate * responseRate);

  if (candidate.primaryCategory) score += weights.primaryCategory;

  return score;
}

export type RankedCandidate = Candidate & { score: number; rank: number };

/**
 * Rank and cut to `market.maxSellers`. Ties break on sellerId so the result
 * is deterministic — a re-run after a crash must fan out to the same set.
 */
export function rankCandidates(
  candidates: Candidate[],
  context: MatchContext,
  settings: LeadSettings,
): RankedCandidate[] {
  return candidates
    .map((candidate) => ({ ...candidate, score: scoreCandidate(candidate, context, settings) }))
    .sort((a, b) => b.score - a.score || a.sellerId.localeCompare(b.sellerId))
    .slice(0, settings.market.maxSellers)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}
