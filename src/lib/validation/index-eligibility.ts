import { z } from "zod";

/**
 * Index eligibility rules and evaluation (decision D2).
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Auto-provisioning a website for every registered seller means the platform
 * generates thousands of near-identical, low-content subdomains by design.
 * Search engines classify that pattern as doorway pages, and the penalty
 * attaches to the ROOT domain — every seller at once, not just the empty ones.
 *
 * A microsite therefore serves `noindex` until it clears the bar below.
 *
 * ── Rules are data, not code ─────────────────────────────────────────────────
 * The ruleset lives in the `Setting` table under `index_eligibility` and is
 * tunable from the admin dashboard without a deploy. These thresholds are an
 * SEO hypothesis, not a fact: the first time Search Console shows thin-content
 * warnings, the right response is to raise the bar that afternoon. If instead
 * the bar is gatekeeping legitimate small sellers, it must come down just as
 * fast.
 *
 * ── This module is deliberately pure ─────────────────────────────────────────
 * No database, no `server-only`. The evaluation is a pure function of a
 * snapshot, so the rules are unit-testable against fixtures — which is what
 * makes them safe to tune. All I/O lives in
 * src/server/services/indexability.service.ts.
 */

export const indexEligibilityRulesSchema = z.object({
  /** Seller must have completed business verification. */
  requireVerifiedSeller: z.boolean().default(true),
  /** The owner's phone must be verified. */
  requireVerifiedPhone: z.boolean().default(true),
  /** Must not be suspended or banned. */
  requireActiveStatus: z.boolean().default(true),
  /** The website must have been explicitly published by the seller. */
  requirePublishedWebsite: z.boolean().default(true),

  /** Length guard against placeholder business names. */
  minBusinessNameLength: z.number().int().min(0).max(200).default(3),
  /**
   * Minimum description length — the single strongest signal. A page with no
   * prose is the definition of thin content.
   */
  minDescriptionLength: z.number().int().min(0).max(5000).default(150),

  requireLogoOrCoverImage: z.boolean().default(true),
  requireLocation: z.boolean().default(true),
  /** Phone, WhatsApp or email — at least one way to make contact. */
  requireContactMethod: z.boolean().default(true),
  requireAddress: z.boolean().default(true),

  /**
   * Catalogue thresholds. EITHER bar clears the gate, so a pure services
   * business is not penalised for having no products.
   */
  minPublishedProducts: z.number().int().min(0).max(100).default(3),
  minPublishedServices: z.number().int().min(0).max(100).default(2),

  /** Content must have cleared moderation. */
  requireModerationClear: z.boolean().default(true),

  /**
   * Score threshold, 0-100, applied on top of the hard requirements so the bar
   * can be tightened without inventing new binary rules.
   */
  minProfileScore: z.number().int().min(0).max(100).default(60),
});

export type IndexEligibilityRules = z.infer<typeof indexEligibilityRulesSchema>;

export const DEFAULT_INDEX_ELIGIBILITY_RULES: IndexEligibilityRules =
  indexEligibilityRulesSchema.parse({});

/** Settings key holding the active ruleset. */
export const INDEX_ELIGIBILITY_SETTING_KEY = "index_eligibility";

/** A single unmet requirement, surfaced to the seller as a to-do item. */
export type EligibilityFailure = {
  code: string;
  /** Written for the seller, not the developer. Actionable, not diagnostic. */
  message: string;
  /** Score contribution, so the UI can rank what to fix first. */
  weight: number;
};

export type EligibilityResult = {
  eligible: boolean;
  /** 0-100. Persisted to Seller.profileScore. */
  score: number;
  failures: EligibilityFailure[];
  /** Short reason persisted to SellerWebsite.indexBlockReason. */
  blockReason: string | null;
};

/**
 * Everything the rules examine.
 *
 * Gathered by the service; declared here so the evaluation stays pure.
 */
export type SellerSnapshot = {
  status: string;
  businessName: string;
  description: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  locationId: string | null;
  addressLine1: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  verifiedAt: Date | null;
  phoneVerified: boolean;
  publishedProducts: number;
  publishedServices: number;
  flaggedContent: number;
  websitePublishedAt: Date | null;
};

/** Weights sum to 100 so the score reads to sellers as "percent complete". */
const WEIGHTS = {
  verified: 15,
  activeStatus: 10,
  published: 10,
  businessName: 5,
  description: 20,
  image: 10,
  location: 5,
  contact: 10,
  address: 5,
  catalogue: 10,
} as const;

/**
 * Evaluate a seller against the active ruleset.
 *
 * Returns EVERY unmet requirement rather than short-circuiting on the first:
 * the seller dashboard renders this as a checklist, and a checklist that
 * reveals one item at a time is a miserable way to complete a profile.
 */
export function evaluateEligibility(
  seller: SellerSnapshot,
  rules: IndexEligibilityRules,
): EligibilityResult {
  const failures: EligibilityFailure[] = [];
  let score = 0;

  const add = (points: number) => {
    score += points;
  };

  // ── Verification ──
  if (seller.verifiedAt) {
    add(WEIGHTS.verified);
  } else if (rules.requireVerifiedSeller) {
    failures.push({
      code: "not_verified",
      message: "Complete business verification.",
      weight: WEIGHTS.verified,
    });
  }

  if (rules.requireVerifiedPhone && !seller.phoneVerified) {
    failures.push({
      code: "phone_unverified",
      message: "Verify your phone number.",
      weight: 0,
    });
  }

  // ── Account standing ──
  const active = seller.status !== "SUSPENDED" && seller.status !== "BANNED";
  if (active) {
    add(WEIGHTS.activeStatus);
  } else if (rules.requireActiveStatus) {
    failures.push({
      code: "inactive",
      message: "Your account is suspended.",
      weight: WEIGHTS.activeStatus,
    });
  }

  // ── Website published ──
  if (seller.websitePublishedAt) {
    add(WEIGHTS.published);
  } else if (rules.requirePublishedWebsite) {
    failures.push({
      code: "not_published",
      message: "Publish your website.",
      weight: WEIGHTS.published,
    });
  }

  // ── Business name ──
  if (seller.businessName.trim().length >= rules.minBusinessNameLength) {
    add(WEIGHTS.businessName);
  } else {
    failures.push({
      code: "business_name",
      message: "Add your full business name.",
      weight: WEIGHTS.businessName,
    });
  }

  // ── Description ──
  const descriptionLength = seller.description?.trim().length ?? 0;
  if (descriptionLength >= rules.minDescriptionLength) {
    add(WEIGHTS.description);
  } else {
    failures.push({
      code: "description",
      message: `Write at least ${rules.minDescriptionLength} characters about your business (currently ${descriptionLength}).`,
      weight: WEIGHTS.description,
    });
  }

  // ── Imagery ──
  if (seller.logoUrl ?? seller.coverImageUrl) {
    add(WEIGHTS.image);
  } else if (rules.requireLogoOrCoverImage) {
    failures.push({
      code: "image",
      message: "Upload a logo or cover image.",
      weight: WEIGHTS.image,
    });
  }

  // ── Location ──
  if (seller.locationId) {
    add(WEIGHTS.location);
  } else if (rules.requireLocation) {
    failures.push({
      code: "location",
      message: "Select your city.",
      weight: WEIGHTS.location,
    });
  }

  // ── Contact method ──
  if (seller.phone ?? seller.whatsapp ?? seller.email) {
    add(WEIGHTS.contact);
  } else if (rules.requireContactMethod) {
    failures.push({
      code: "contact",
      message: "Add a phone number, WhatsApp number or email address.",
      weight: WEIGHTS.contact,
    });
  }

  // ── Address ──
  if (seller.addressLine1) {
    add(WEIGHTS.address);
  } else if (rules.requireAddress) {
    failures.push({
      code: "address",
      message: "Add your business address.",
      weight: WEIGHTS.address,
    });
  }

  // ── Catalogue: products OR services clears the bar ──
  const catalogueOk =
    seller.publishedProducts >= rules.minPublishedProducts ||
    seller.publishedServices >= rules.minPublishedServices;

  if (catalogueOk) {
    add(WEIGHTS.catalogue);
  } else {
    failures.push({
      code: "catalogue",
      message: `Publish at least ${rules.minPublishedProducts} products or ${rules.minPublishedServices} services.`,
      weight: WEIGHTS.catalogue,
    });
  }

  // ── Moderation ──
  if (rules.requireModerationClear && seller.flaggedContent > 0) {
    failures.push({
      code: "moderation",
      message: "Some content is under review.",
      weight: 0,
    });
  }

  const eligible = failures.length === 0 && score >= rules.minProfileScore;

  return {
    eligible,
    score: Math.min(100, score),
    failures,
    blockReason: eligible ? null : (failures[0]?.code ?? "score_below_threshold"),
  };
}
