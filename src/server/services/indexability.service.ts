import "server-only";
import { db } from "@/lib/db";
import { revalidateIndexability } from "@/lib/cache/revalidate";
import {
  DEFAULT_INDEX_ELIGIBILITY_RULES,
  INDEX_ELIGIBILITY_SETTING_KEY,
  evaluateEligibility,
  indexEligibilityRulesSchema,
  type EligibilityResult,
  type IndexEligibilityRules,
} from "@/lib/validation/index-eligibility";

/**
 * Index eligibility — the I/O half (decision D2).
 *
 * The rule evaluation itself is a pure function in
 * src/lib/validation/index-eligibility.ts, unit-tested against fixtures. This
 * module owns only the parts that touch the world: loading the configurable
 * ruleset, gathering the seller snapshot, persisting the verdict, and
 * invalidating caches.
 *
 * ── Why the verdict is persisted ─────────────────────────────────────────────
 * `SellerWebsite.indexable` is computed in the WRITE path and stored, so
 * robots.txt and generateMetadata read a boolean column. Scoring at request
 * time would put a multi-table query on a file crawlers hit constantly.
 *
 * Recompute after: profile edits, product/service publish or unpublish,
 * verification changes, suspension, moderation decisions, website publish.
 * The nightly recompute-indexability job catches anything a code path forgot —
 * a missed hook should cost a day of staleness, not a permanent wrong answer.
 */

/** Load the active ruleset, falling back to defaults when unset or corrupt. */
export async function getIndexEligibilityRules(): Promise<IndexEligibilityRules> {
  const setting = await db.setting.findUnique({
    where: { key: INDEX_ELIGIBILITY_SETTING_KEY },
    select: { value: true },
  });

  if (!setting) return DEFAULT_INDEX_ELIGIBILITY_RULES;

  const parsed = indexEligibilityRulesSchema.safeParse(setting.value);
  // A malformed settings row must not take the whole platform's SEO with it.
  return parsed.success ? parsed.data : DEFAULT_INDEX_ELIGIBILITY_RULES;
}

/**
 * Recompute and persist eligibility for one seller.
 *
 * Returns the result so callers can show the seller exactly what remains.
 * Caches are revalidated only when the flag actually flips — a nightly sweep
 * over 10,000 sellers must not invalidate 10,000 sites for nothing.
 */
export async function recomputeIndexability(sellerId: string): Promise<EligibilityResult | null> {
  const rules = await getIndexEligibilityRules();

  const seller = await db.seller.findUnique({
    where: { id: sellerId },
    select: {
      slug: true,
      status: true,
      businessName: true,
      description: true,
      logoUrl: true,
      coverImageUrl: true,
      locationId: true,
      addressLine1: true,
      phone: true,
      whatsapp: true,
      email: true,
      verifiedAt: true,
      deletedAt: true,
      website: { select: { indexable: true, publishedAt: true } },
      members: {
        where: { role: "SELLER_OWNER" },
        select: { user: { select: { phoneVerified: true } } },
        take: 1,
      },
    },
  });

  if (!seller || seller.deletedAt) return null;

  const [publishedProducts, publishedServices, flaggedContent] = await Promise.all([
    db.product.count({
      where: { sellerId, status: "PUBLISHED", deletedAt: null, moderationStatus: "APPROVED" },
    }),
    db.service.count({
      where: { sellerId, status: "PUBLISHED", deletedAt: null, moderationStatus: "APPROVED" },
    }),
    db.product.count({ where: { sellerId, moderationStatus: "FLAGGED", deletedAt: null } }),
  ]);

  const result = evaluateEligibility(
    {
      status: seller.status,
      businessName: seller.businessName,
      description: seller.description,
      logoUrl: seller.logoUrl,
      coverImageUrl: seller.coverImageUrl,
      locationId: seller.locationId,
      addressLine1: seller.addressLine1,
      phone: seller.phone,
      whatsapp: seller.whatsapp,
      email: seller.email,
      verifiedAt: seller.verifiedAt,
      phoneVerified: Boolean(seller.members[0]?.user.phoneVerified),
      publishedProducts,
      publishedServices,
      flaggedContent,
      websitePublishedAt: seller.website?.publishedAt ?? null,
    },
    rules,
  );

  const changed = seller.website?.indexable !== result.eligible;

  await db.$transaction([
    db.seller.update({ where: { id: sellerId }, data: { profileScore: result.score } }),
    db.sellerWebsite.update({
      where: { sellerId },
      data: { indexable: result.eligible, indexBlockReason: result.blockReason },
    }),
  ]);

  if (changed) {
    revalidateIndexability(seller.slug);
  }

  return result;
}

export { evaluateEligibility };
