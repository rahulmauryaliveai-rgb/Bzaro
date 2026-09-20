import { describe, expect, it } from "vitest";
import { rankCandidates, scoreCandidate, type Candidate } from "@/lib/leads/scoring";
import { DEFAULT_LEAD_SETTINGS } from "@/lib/validation/lead-settings";

/**
 * Who gets a paid market lead. The ordering rules are the product's pricing
 * promise: plan tier outranks everything, then city tiers, then history.
 */

const settings = DEFAULT_LEAD_SETTINGS;
const ctx = { locationId: "mumbai", clusterKey: null };
const ncr = { locationId: "noida", clusterKey: "ncr" };

function candidate(overrides: Partial<Candidate>): Candidate {
  return {
    sellerId: "s",
    planTier: 0,
    locationId: null,
    clusterKey: null,
    servesCity: false,
    responseRate: null,
    primaryCategory: false,
    ...overrides,
  };
}

describe("scoreCandidate", () => {
  it("weights plan tier above every other signal combined", () => {
    const paidFar = candidate({ planTier: 1 });
    const freePerfect = candidate({
      locationId: "mumbai",
      responseRate: 1,
      primaryCategory: true,
      servesCity: true,
    });
    expect(scoreCandidate(paidFar, ctx, settings)).toBeGreaterThan(
      scoreCandidate(freePerfect, ctx, settings),
    );
  });

  it("tiers city signals: same city > cluster > serves > nothing", () => {
    const same = scoreCandidate(candidate({ locationId: "noida" }), ncr, settings);
    const cluster = scoreCandidate(
      candidate({ locationId: "gurugram", clusterKey: "ncr" }),
      ncr,
      settings,
    );
    const serves = scoreCandidate(
      candidate({ locationId: "pune", servesCity: true }),
      ncr,
      settings,
    );
    const none = scoreCandidate(candidate({ locationId: "pune" }), ncr, settings);
    expect(same).toBeGreaterThan(cluster);
    expect(cluster).toBeGreaterThan(serves);
    expect(serves).toBeGreaterThan(none);
  });

  it("does not stack city signals", () => {
    const sameOnly = scoreCandidate(candidate({ locationId: "mumbai" }), ctx, settings);
    const sameAndServes = scoreCandidate(
      candidate({ locationId: "mumbai", servesCity: true }),
      ctx,
      settings,
    );
    expect(sameAndServes).toBe(sameOnly);
  });

  it("ranks a new seller at the neutral default, not at zero", () => {
    const fresh = scoreCandidate(candidate({ responseRate: null }), ctx, settings);
    const neutral = scoreCandidate(
      candidate({ responseRate: settings.neutralResponseRate }),
      ctx,
      settings,
    );
    const bad = scoreCandidate(candidate({ responseRate: 0 }), ctx, settings);
    expect(fresh).toBe(neutral);
    expect(fresh).toBeGreaterThan(bad);
  });
});

describe("rankCandidates", () => {
  it("cuts to maxSellers, highest first, with stable ties", () => {
    const many = Array.from({ length: 15 }, (_, i) =>
      candidate({ sellerId: `s${String(i).padStart(2, "0")}`, planTier: i % 3 }),
    );
    const ranked = rankCandidates(many, ctx, settings);
    expect(ranked).toHaveLength(settings.market.maxSellers);
    expect(ranked[0]!.rank).toBe(1);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1]!.score).toBeGreaterThanOrEqual(ranked[i]!.score);
    }
    // Gold sellers (tier 2) all come before basic (tier 1).
    const tiers = ranked.map((c) => c.planTier);
    expect(tiers.slice(0, 5)).toEqual([2, 2, 2, 2, 2]);
    // Deterministic: a re-run yields the same set in the same order.
    expect(rankCandidates([...many].reverse(), ctx, settings)).toEqual(ranked);
  });
});
