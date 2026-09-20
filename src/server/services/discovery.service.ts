import "server-only";
import { unstable_cache } from "next/cache";
import { db, Prisma } from "@/lib/db";
import { cacheTags } from "@/lib/cache/tags";
import { revalidateDiscovery, type RevalidateMode } from "@/lib/cache/revalidate";

/**
 * Buyer discovery reads: the homepage blocks, city landing pages and
 * city × category listings.
 *
 * ── Every read is cached AND tagged ──────────────────────────────────────────
 * These back ISR pages (`export const revalidate`), so a freshly verified
 * seller would otherwise wait an hour to appear. The tags let the write paths
 * purge exactly the pages a seller can appear on — see
 * `revalidateSellerDiscovery` at the bottom, which every seller/product write
 * calls.
 *
 * Only VERIFIED, non-deleted sellers with an approved, published catalogue
 * count. A seller in PENDING_VERIFICATION is invisible here, exactly as their
 * microsite 404s.
 */

const REVALIDATE = 3600;

const LIVE_SELLER = { status: "VERIFIED", deletedAt: null } as const;

const sellerCardSelect = {
  id: true,
  slug: true,
  businessName: true,
  tagline: true,
  logoUrl: true,
  productCount: true,
  serviceCount: true,
  ratingAvg: true,
  ratingCount: true,
  establishedYear: true,
  verifiedAt: true,
  businessType: true,
  responseRate: true,
  location: { select: { name: true, parent: { select: { name: true } } } },
  subscriptions: {
    where: { status: { in: ["ACTIVE", "TRIALING"] } },
    take: 1,
    select: { plan: { select: { key: true, sortOrder: true } } },
  },
} satisfies Prisma.SellerSelect;

const productCardSelect = {
  id: true,
  slug: true,
  name: true,
  shortDescription: true,
  brand: true,
  priceMinor: true,
  priceMaxMinor: true,
  currency: true,
  unit: true,
  priceOnRequest: true,
  isFeatured: true,
  createdAt: true,
  images: {
    where: { moderationStatus: "APPROVED" },
    orderBy: { sortOrder: "asc" },
    take: 1,
    select: { url: true, alt: true },
  },
  category: { select: { name: true, path: true } },
  seller: {
    select: {
      slug: true,
      businessName: true,
      verifiedAt: true,
      location: { select: { name: true, parent: { select: { name: true } } } },
    },
  },
} satisfies Prisma.ProductSelect;

const LIVE_PRODUCT = {
  status: "PUBLISHED",
  deletedAt: null,
  moderationStatus: "APPROVED",
  seller: LIVE_SELLER,
} as const;

/** A city by its slug. Cities are the only location type buyers pick. */
export function getCityBySlug(slug: string) {
  return unstable_cache(
    async () =>
      db.location.findFirst({
        where: { slug, type: "CITY", isActive: true },
        select: {
          id: true,
          slug: true,
          name: true,
          path: true,
          clusterKey: true,
          sellerCount: true,
          parent: { select: { name: true, slug: true } },
        },
      }),
    ["discovery-city", slug],
    { tags: [cacheTags.locationTree()], revalidate: REVALIDATE },
  )();
}

/** Root categories with live-seller counts, for the homepage grid. */
export function getCategoryGrid() {
  return unstable_cache(
    async () => {
      const categories = await db.category.findMany({
        where: { parentId: null, isActive: true },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          slug: true,
          name: true,
          path: true,
          iconUrl: true,
          imageUrl: true,
          productCount: true,
        },
      });
      // Sellers may sit at any depth; count every seller under the root, and
      // borrow a product photo from the subtree for the tile when the category
      // itself has no image.
      const extras = await Promise.all(
        categories.map(async (category) => {
          const subtree = { OR: [{ id: category.id }, { ancestorIds: { has: category.id } }] };
          const [sellerCount, sample] = await Promise.all([
            db.seller.count({
              where: { ...LIVE_SELLER, categories: { some: { category: subtree } } },
            }),
            category.imageUrl
              ? null
              : db.productImage.findFirst({
                  where: {
                    moderationStatus: "APPROVED",
                    product: { ...LIVE_PRODUCT, category: subtree },
                  },
                  orderBy: [{ product: { isFeatured: "desc" } }, { sortOrder: "asc" }],
                  select: { url: true },
                }),
          ]);
          return { sellerCount, imageUrl: category.imageUrl ?? sample?.url ?? null };
        }),
      );
      return categories.map((category, index) => ({ ...category, ...extras[index]! }));
    },
    ["discovery-category-grid"],
    { tags: [cacheTags.home(), cacheTags.categoryTree()], revalidate: REVALIDATE },
  )();
}

/**
 * The "Popular in <city>" block: top suppliers, the categories they cover,
 * and the newest products. Tagged per city so a new seller in Pune purges
 * only Pune.
 */
export function getPopularInCity(locationId: string) {
  return unstable_cache(
    async () => {
      const [sellers, products, categoryRows, sellerTotal] = await Promise.all([
        db.seller.findMany({
          where: { ...LIVE_SELLER, locationId },
          orderBy: [{ ratingAvg: "desc" }, { productCount: "desc" }, { createdAt: "asc" }],
          take: 6,
          select: sellerCardSelect,
        }),
        db.product.findMany({
          where: { ...LIVE_PRODUCT, seller: { ...LIVE_SELLER, locationId } },
          orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
          take: 8,
          select: productCardSelect,
        }),
        db.sellerCategory.groupBy({
          by: ["categoryId"],
          where: { seller: { ...LIVE_SELLER, locationId } },
          _count: { _all: true },
          orderBy: { _count: { categoryId: "desc" } },
          take: 8,
        }),
        db.seller.count({ where: { ...LIVE_SELLER, locationId } }),
      ]);

      const categories = categoryRows.length
        ? await db.category.findMany({
            where: { id: { in: categoryRows.map((row) => row.categoryId) }, isActive: true },
            select: { id: true, slug: true, name: true, path: true },
          })
        : [];
      const countById = new Map(categoryRows.map((row) => [row.categoryId, row._count._all]));

      return {
        sellers,
        products,
        sellerTotal,
        categories: categories
          .map((category) => ({ ...category, sellerCount: countById.get(category.id) ?? 0 }))
          .sort((a, b) => b.sellerCount - a.sellerCount),
      };
    },
    ["discovery-popular", locationId],
    {
      tags: [cacheTags.popularInCity(locationId), cacheTags.discoveryCity(locationId)],
      revalidate: REVALIDATE,
    },
  )();
}

/**
 * City × category listing (page 1 only — this is an ISR page). Sellers in the
 * category or any of its descendants, located in the city; the products they
 * publish there. The filterable, paginated version lives on the dynamic
 * /category page with `?location=`.
 */
export function getCityCategoryListing(locationId: string, categoryId: string) {
  return unstable_cache(
    async () => {
      const categoryFilter = {
        some: { category: { OR: [{ id: categoryId }, { ancestorIds: { has: categoryId } }] } },
      };
      const [sellers, products, sellerTotal] = await Promise.all([
        db.seller.findMany({
          where: { ...LIVE_SELLER, locationId, categories: categoryFilter },
          orderBy: [{ ratingAvg: "desc" }, { productCount: "desc" }, { createdAt: "asc" }],
          take: 24,
          select: sellerCardSelect,
        }),
        db.product.findMany({
          where: {
            ...LIVE_PRODUCT,
            seller: { ...LIVE_SELLER, locationId },
            OR: [{ categoryId }, { category: { ancestorIds: { has: categoryId } } }],
          },
          orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
          take: 12,
          select: productCardSelect,
        }),
        db.seller.count({ where: { ...LIVE_SELLER, locationId, categories: categoryFilter } }),
      ]);
      return { sellers, products, sellerTotal };
    },
    ["discovery-city-category", locationId, categoryId],
    {
      tags: [
        cacheTags.discoveryCityCategory(locationId, categoryId),
        cacheTags.discoveryCategory(categoryId),
        cacheTags.discoveryCity(locationId),
      ],
      revalidate: REVALIDATE,
    },
  )();
}

/** Headline numbers for the hero and the stats band. */
export function getPlatformStats() {
  return unstable_cache(
    async () => {
      const [sellers, products, categories, cities] = await Promise.all([
        db.seller.count({ where: LIVE_SELLER }),
        db.product.count({ where: LIVE_PRODUCT }),
        db.category.count({ where: { isActive: true } }),
        db.location.count({ where: { type: "CITY", isActive: true } }),
      ]);
      return { sellers, products, categories, cities };
    },
    ["discovery-platform-stats"],
    { tags: [cacheTags.home()], revalidate: REVALIDATE },
  )();
}

/** The most-populated city, for the homepage's default "Popular in" block. */
export function getTopCity() {
  return unstable_cache(
    async () =>
      db.location.findFirst({
        where: { type: "CITY", isActive: true },
        orderBy: [{ sellerCount: "desc" }, { name: "asc" }],
        select: { id: true, slug: true, name: true },
      }),
    ["discovery-top-city"],
    { tags: [cacheTags.locationTree(), cacheTags.home()], revalidate: REVALIDATE },
  )();
}

/**
 * Purge every discovery page this seller can appear on. Called from every
 * seller-status, profile and catalogue write — cheap (a handful of tags) and
 * the reason a newly verified seller shows up in minutes, not after the next
 * build.
 */
export async function revalidateSellerDiscovery(
  sellerId: string,
  mode: RevalidateMode = "background",
): Promise<void> {
  const seller = await db.seller.findUnique({
    where: { id: sellerId },
    select: {
      locationId: true,
      categories: { select: { category: { select: { id: true, ancestorIds: true } } } },
      serviceAreas: { select: { locationId: true } },
    },
  });
  if (!seller) return;

  const categoryIds = new Set<string>();
  for (const { category } of seller.categories) {
    categoryIds.add(category.id);
    for (const ancestorId of category.ancestorIds) categoryIds.add(ancestorId);
  }
  const locationIds = new Set<string>(seller.serviceAreas.map((area) => area.locationId));
  if (seller.locationId) locationIds.add(seller.locationId);

  revalidateDiscovery({ categoryIds: [...categoryIds], locationIds: [...locationIds] }, mode);
}
