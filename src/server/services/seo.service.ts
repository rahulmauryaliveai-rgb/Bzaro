import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { cacheTags } from "@/lib/cache/tags";

/**
 * Content counts that decide whether a taxonomy page is worth indexing (D44).
 *
 * Read live rather than from `Category.productCount`: that counter is
 * reconciled nightly, and "is this page empty?" must not depend on whether the
 * cron ran. Cached for an hour and purged with the category tree.
 */

const LIVE_ITEM = {
  status: "PUBLISHED" as const,
  deletedAt: null,
  moderationStatus: "APPROVED" as const,
  seller: { status: "VERIFIED" as const, deletedAt: null },
};

/** Live products + services filed anywhere under `categoryId`. */
export function getCategoryContentCount(categoryId: string) {
  return unstable_cache(
    async () => {
      const inSubtree = {
        OR: [{ categoryId }, { category: { ancestorIds: { has: categoryId } } }],
      };
      const [products, services] = await Promise.all([
        db.product.count({ where: { ...LIVE_ITEM, ...inSubtree } }),
        db.service.count({ where: { ...LIVE_ITEM, ...inSubtree } }),
      ]);
      return { products, services, total: products + services };
    },
    ["seo-category-count", categoryId],
    { tags: [cacheTags.categoryTree(), cacheTags.discoveryCategory(categoryId)], revalidate: 3600 },
  )();
}

/** Verified sellers located anywhere under `locationId`. */
export function getLocationSellerCount(locationId: string) {
  return unstable_cache(
    async () =>
      db.seller.count({
        where: {
          status: "VERIFIED",
          deletedAt: null,
          location: { OR: [{ id: locationId }, { ancestorIds: { has: locationId } }] },
        },
      }),
    ["seo-location-count", locationId],
    { tags: [cacheTags.locationTree(), cacheTags.discoveryCity(locationId)], revalidate: 3600 },
  )();
}

/** Cities where this category (or its subtree) has verified sellers. */
export function getCategoryCities(categoryId: string, limit = 12) {
  return unstable_cache(
    async () => {
      const rows = await db.seller.groupBy({
        by: ["locationId"],
        where: {
          status: "VERIFIED",
          deletedAt: null,
          locationId: { not: null },
          categories: {
            some: {
              category: { OR: [{ id: categoryId }, { ancestorIds: { has: categoryId } }] },
            },
          },
        },
        _count: { _all: true },
      });
      const counts = new Map(
        rows.flatMap((row) => (row.locationId ? [[row.locationId, row._count._all] as const] : [])),
      );
      if (counts.size === 0) return [];
      const cities = await db.location.findMany({
        where: { id: { in: [...counts.keys()] }, type: "CITY", isActive: true },
        select: { id: true, slug: true, name: true },
      });
      return cities
        .map((city) => ({ ...city, sellerCount: counts.get(city.id) ?? 0 }))
        .sort((a, b) => b.sellerCount - a.sellerCount || a.name.localeCompare(b.name))
        .slice(0, limit);
    },
    ["seo-category-cities", categoryId, String(limit)],
    { tags: [cacheTags.categoryTree(), cacheTags.discoveryCategory(categoryId)], revalidate: 3600 },
  )();
}
