import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { cacheTags } from "@/lib/cache/tags";

/**
 * Sitemap data.
 *
 * ── Only indexable sellers appear ────────────────────────────────────────────
 * The D2 eligibility gate governs sitemaps and meta-robots together. If they
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
        select: { slug: true, updatedAt: true },
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
        select: { slug: true, updatedAt: true, seller: { select: { slug: true } } },
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
        select: { slug: true, updatedAt: true, seller: { select: { slug: true } } },
      }),
    ["sitemap-services", String(offset), String(limit)],
    { tags: [cacheTags.sitemap()], revalidate: SITEMAP_REVALIDATE },
  )();
}

/**
 * Taxonomy pages.
 *
 * Only nodes with content: an empty category page is thin content, and the
 * whole point of the gate is to keep those out of the index.
 */
export function listSitemapCategories() {
  return unstable_cache(
    async () =>
      db.category.findMany({
        where: { isActive: true, productCount: { gt: 0 } },
        orderBy: { path: "asc" },
        take: SITEMAP_PAGE_SIZE,
        select: { path: true },
      }),
    ["sitemap-categories"],
    { tags: [cacheTags.categoryTree()], revalidate: SITEMAP_REVALIDATE },
  )();
}

export function listSitemapLocations() {
  return unstable_cache(
    async () =>
      db.location.findMany({
        where: { isActive: true, sellerCount: { gt: 0 } },
        orderBy: { path: "asc" },
        take: SITEMAP_PAGE_SIZE,
        select: { path: true },
      }),
    ["sitemap-locations"],
    { tags: [cacheTags.locationTree()], revalidate: SITEMAP_REVALIDATE },
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
