import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { cacheTags } from "@/lib/cache/tags";

/**
 * Sitemap data.
 *
 * ── Only indexable sellers appear ────────────────────────────────────────────
 * The D2 eligibility gate governs sitemaps and meta-robots together. Since D44
 * a Free (catalogue-tier) seller can clear it too, and is listed at their
 * marketplace URL — see `sellerCanonicalUrl`. If they
 * disagree — a sitemap advertising URLs that serve `noindex` — that is a
 * contradictory signal, and it is the specific pattern that makes a large
 * auto-generated site look manipulative rather than merely incomplete.
 *
 * ── lastModified is real ─────────────────────────────────────────────────────
 * Taken from `updatedAt`, never `new Date()`. A sitemap that claims everything
 * changed today teaches crawlers to ignore the field entirely, which then
 * wastes crawl budget re-fetching pages that have not changed.
 */

const SITEMAP_REVALIDATE = 3600;

/** Google's hard cap is 50,000 URLs per sitemap; stay well under it. */
export const SITEMAP_PAGE_SIZE = 10_000;

/** Sellers whose sites have cleared the D2 gate. */
export function listIndexableSellers(offset = 0, limit = SITEMAP_PAGE_SIZE) {
  return unstable_cache(
    async () =>
      db.seller.findMany({
        where: {
          status: "VERIFIED",
          deletedAt: null,
          website: { indexable: true },
        },
        orderBy: { createdAt: "asc" },
        skip: offset,
        take: limit,
        select: {
          slug: true,
          updatedAt: true,
          webPresence: true,
          website: { select: { indexable: true, customDomain: true, customDomainStatus: true } },
        },
      }),
    ["sitemap-sellers", String(offset), String(limit)],
    { tags: [cacheTags.sitemap()], revalidate: SITEMAP_REVALIDATE },
  )();
}

export function countIndexableSellers() {
  return unstable_cache(
    async () =>
      db.seller.count({
        where: { status: "VERIFIED", deletedAt: null, website: { indexable: true } },
      }),
    ["sitemap-seller-count"],
    { tags: [cacheTags.sitemap()], revalidate: SITEMAP_REVALIDATE },
  )();
}

/**
 * Live products belonging to indexable sellers.
 *
 * The seller-level filter matters: a product page on a `noindex` microsite must
 * not be advertised in the apex sitemap either, or the two surfaces contradict
 * each other about whether that seller's content should be crawled.
 */
export function listIndexableProducts(offset = 0, limit = SITEMAP_PAGE_SIZE) {
  return unstable_cache(
    async () =>
      db.product.findMany({
        where: {
          status: "PUBLISHED",
          deletedAt: null,
          moderationStatus: "APPROVED",
          seller: { status: "VERIFIED", deletedAt: null, website: { indexable: true } },
        },
        orderBy: { createdAt: "asc" },
        skip: offset,
        take: limit,
        select: {
          slug: true,
          updatedAt: true,
          seller: {
            select: {
              slug: true,
              webPresence: true,
              website: {
                select: { indexable: true, customDomain: true, customDomainStatus: true },
              },
            },
          },
        },
      }),
    ["sitemap-products", String(offset), String(limit)],
    { tags: [cacheTags.sitemap()], revalidate: SITEMAP_REVALIDATE },
  )();
}

export function countIndexableProducts() {
  return unstable_cache(
    async () =>
      db.product.count({
        where: {
          status: "PUBLISHED",
          deletedAt: null,
          moderationStatus: "APPROVED",
          seller: { status: "VERIFIED", deletedAt: null, website: { indexable: true } },
        },
      }),
    ["sitemap-product-count"],
    { tags: [cacheTags.sitemap()], revalidate: SITEMAP_REVALIDATE },
  )();
}

export function listIndexableServices(offset = 0, limit = SITEMAP_PAGE_SIZE) {
  return unstable_cache(
    async () =>
      db.service.findMany({
        where: {
          status: "PUBLISHED",
          deletedAt: null,
          moderationStatus: "APPROVED",
          seller: { status: "VERIFIED", deletedAt: null, website: { indexable: true } },
        },
        orderBy: { createdAt: "asc" },
        skip: offset,
        take: limit,
        select: {
          slug: true,
          updatedAt: true,
          seller: {
            select: {
              slug: true,
              webPresence: true,
              website: {
                select: { indexable: true, customDomain: true, customDomainStatus: true },
              },
            },
          },
        },
      }),
    ["sitemap-services", String(offset), String(limit)],
    { tags: [cacheTags.sitemap()], revalidate: SITEMAP_REVALIDATE },
  )();
}

/**
 * Taxonomy pages.
 *
 * Only nodes with content: an empty category page is thin content, and the
 * whole point of the gate is to keep those out of the index. Derived from live
 * listings rather than the nightly counters, so a category appears the hour
 * its first product goes live (and never waits on a cron that did not run).
 * A category counts when anything in its subtree is live.
 */
export function listSitemapCategories() {
  return unstable_cache(
    async () => {
      const live = {
        status: "PUBLISHED" as const,
        deletedAt: null,
        moderationStatus: "APPROVED" as const,
        seller: { status: "VERIFIED" as const, deletedAt: null },
        categoryId: { not: null },
      };
      const [products, services] = await Promise.all([
        db.product.findMany({
          where: live,
          distinct: ["categoryId"],
          select: { category: { select: { id: true, ancestorIds: true } } },
        }),
        db.service.findMany({
          where: live,
          distinct: ["categoryId"],
          select: { category: { select: { id: true, ancestorIds: true } } },
        }),
      ]);
      const ids = new Set<string>();
      for (const row of [...products, ...services]) {
        if (!row.category) continue;
        ids.add(row.category.id);
        for (const ancestor of row.category.ancestorIds) ids.add(ancestor);
      }
      if (ids.size === 0) return [];
      return db.category.findMany({
        where: { id: { in: [...ids] }, isActive: true, noindex: false },
        orderBy: { path: "asc" },
        take: SITEMAP_PAGE_SIZE,
        select: { path: true },
      });
    },
    ["sitemap-categories"],
    { tags: [cacheTags.categoryTree(), cacheTags.sitemap()], revalidate: SITEMAP_REVALIDATE },
  )();
}

/** Location pages with at least one verified seller anywhere beneath them. */
export function listSitemapLocations() {
  return unstable_cache(
    async () => {
      const sellers = await db.seller.findMany({
        where: { status: "VERIFIED", deletedAt: null, locationId: { not: null } },
        distinct: ["locationId"],
        select: { location: { select: { id: true, ancestorIds: true } } },
      });
      const ids = new Set<string>();
      for (const row of sellers) {
        if (!row.location) continue;
        ids.add(row.location.id);
        for (const ancestor of row.location.ancestorIds) ids.add(ancestor);
      }
      if (ids.size === 0) return [];
      return db.location.findMany({
        where: { id: { in: [...ids] }, isActive: true },
        orderBy: { path: "asc" },
        take: SITEMAP_PAGE_SIZE,
        select: { path: true },
      });
    },
    ["sitemap-locations"],
    { tags: [cacheTags.locationTree(), cacheTags.sitemap()], revalidate: SITEMAP_REVALIDATE },
  )();
}

/**
 * Buyer discovery pages: /<city> and /<city>/category/<path>, for every
 * city × category pair that has at least one live seller. Thin pairs are left
 * out for the same reason empty categories are.
 */
export function listSitemapDiscovery() {
  return unstable_cache(
    async () => {
      // Derived from live sellers, not Location.sellerCount: that counter is
      // reconciled nightly and a new city would otherwise wait a day.
      const liveCities = await db.seller.findMany({
        where: { status: "VERIFIED", deletedAt: null, locationId: { not: null } },
        distinct: ["locationId"],
        select: { locationId: true },
      });
      const cities = await db.location.findMany({
        where: {
          id: { in: liveCities.flatMap((row) => (row.locationId ? [row.locationId] : [])) },
          type: "CITY",
          isActive: true,
        },
        orderBy: { slug: "asc" },
        select: { id: true, slug: true },
      });
      const pairs = await db.sellerCategory.findMany({
        where: { seller: { status: "VERIFIED", deletedAt: null, locationId: { not: null } } },
        select: {
          category: { select: { path: true, isActive: true } },
          seller: { select: { locationId: true } },
        },
        take: SITEMAP_PAGE_SIZE,
      });
      const cityById = new Map(cities.map((city) => [city.id, city.slug]));
      const seen = new Set<string>();
      const entries: { path: string }[] = cities.map((city) => ({ path: `/${city.slug}` }));
      for (const pair of pairs) {
        const citySlug = pair.seller.locationId ? cityById.get(pair.seller.locationId) : null;
        if (!citySlug || !pair.category.isActive) continue;
        const path = `/${citySlug}/category${pair.category.path}`;
        if (seen.has(path)) continue;
        seen.add(path);
        entries.push({ path });
      }
      return entries.slice(0, SITEMAP_PAGE_SIZE);
    },
    ["sitemap-discovery"],
    { tags: [cacheTags.locationTree(), cacheTags.home()], revalidate: SITEMAP_REVALIDATE },
  )();
}

/** Everything on one tenant's microsite, for its own sitemap. */
export function listTenantSitemapEntries(sellerId: string, slug: string) {
  return unstable_cache(
    async () => {
      const [products, services, galleryCount] = await Promise.all([
        db.product.findMany({
          where: {
            sellerId,
            status: "PUBLISHED",
            deletedAt: null,
            moderationStatus: "APPROVED",
          },
          select: { slug: true, updatedAt: true },
          take: 5000,
        }),
        db.service.findMany({
          where: {
            sellerId,
            status: "PUBLISHED",
            deletedAt: null,
            moderationStatus: "APPROVED",
          },
          select: { slug: true, updatedAt: true },
          take: 1000,
        }),
        db.galleryItem.count({
          where: { sellerId, deletedAt: null, moderationStatus: "APPROVED" },
        }),
      ]);

      return { products, services, galleryCount };
    },
    ["sitemap-tenant", sellerId],
    {
      tags: [
        cacheTags.tenantProducts(slug),
        cacheTags.tenantServices(slug),
        cacheTags.tenantGallery(slug),
      ],
      revalidate: SITEMAP_REVALIDATE,
    },
  )();
}
