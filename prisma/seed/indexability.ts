import type { PrismaClient } from "../../src/generated/prisma/client";
import {
  DEFAULT_INDEX_ELIGIBILITY_RULES,
  evaluateEligibility,
} from "../../src/lib/validation/index-eligibility";

/**
 * Compute index eligibility for seeded sellers using the REAL rules.
 *
 * ── Why this step exists ─────────────────────────────────────────────────────
 * The seed used to hardcode `indexable: true` on the fixtures that were
 * supposed to be indexable. That was internally inconsistent: the actual D2
 * rules require a verified phone, which the seed never set — so the first run
 * of the nightly `recompute-indexability` job correctly flipped those fixtures
 * to `false` and quietly broke every test that depended on them.
 *
 * A fixture that disagrees with the rules it is meant to demonstrate is worse
 * than no fixture, because it makes the rules look broken when they are
 * working. So the seed now runs the same pure evaluation the application does,
 * and whatever it says is what gets stored.
 *
 * This is possible because `evaluateEligibility` is deliberately pure and lives
 * outside the `server-only` service — the seed runs under tsx, with no Next.js
 * runtime available.
 */
export async function seedIndexability(prisma: PrismaClient) {
  const sellers = await prisma.seller.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
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
      website: { select: { publishedAt: true } },
      members: {
        where: { role: "SELLER_OWNER" },
        select: { user: { select: { phoneVerified: true } } },
        take: 1,
      },
    },
  });

  for (const seller of sellers) {
    const [publishedProducts, publishedServices, flaggedContent] = await Promise.all([
      prisma.product.count({
        where: {
          sellerId: seller.id,
          status: "PUBLISHED",
          deletedAt: null,
          moderationStatus: "APPROVED",
        },
      }),
      prisma.service.count({
        where: {
          sellerId: seller.id,
          status: "PUBLISHED",
          deletedAt: null,
          moderationStatus: "APPROVED",
        },
      }),
      prisma.product.count({
        where: { sellerId: seller.id, moderationStatus: "FLAGGED", deletedAt: null },
      }),
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
      DEFAULT_INDEX_ELIGIBILITY_RULES,
    );

    await prisma.seller.update({
      where: { id: seller.id },
      data: { profileScore: result.score },
    });

    await prisma.sellerWebsite.updateMany({
      where: { sellerId: seller.id },
      data: { indexable: result.eligible, indexBlockReason: result.blockReason },
    });

    console.log(
      `   ${seller.slug.padEnd(18)} score ${String(result.score).padStart(3)} · ` +
        `${result.eligible ? "indexable" : `blocked: ${result.blockReason}`}`,
    );
  }
}
