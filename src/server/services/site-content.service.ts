import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { cacheTags } from "@/lib/cache/tags";

/**
 * Content loaders for the public seller website.
 *
 * ── Why these are separate from the dashboard's data access ──────────────────
 * The dashboard uses `forSeller()`, which scopes queries to a tenant the caller
 * has been *authorised* for. These loaders serve anonymous visitors, so there
 * is no caller to authorise — the tenant comes from the hostname.
 *
 * They are therefore written with the `sellerId` filter explicit and
 * non-negotiable in every `where` clause, and they only ever return content
 * that is live: PUBLISHED, moderation-APPROVED, and not soft-deleted. A draft
 * product appearing on a public site would be a content leak in the same
 * family as a cross-tenant leak.
 *
 * ── Caching ──────────────────────────────────────────────────────────────────
 * Every loader is wrapped in `unstable_cache` and tagged with the tenant's
 * content tags, so a seller's edit invalidates exactly their own pages. The
 * cache key always includes `sellerId`, which — combined with the tenant living
 * in the URL path — is what keeps one seller's catalogue from ever being served
 * on another's domain.
 */

const CONTENT_REVALIDATE_SECONDS = 3600;

/** Only live content is ever public. Reused by every loader below. */
const LIVE = {
  status: "PUBLISHED",
  deletedAt: null,
  moderationStatus: "APPROVED",
} as const;

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
  minOrderQty: true,
  priceOnRequest: true,
  isFeatured: true,
  createdAt: true,
  category: { select: { name: true, slug: true, path: true } },
  images: {
    where: { moderationStatus: "APPROVED" as const },
    orderBy: { sortOrder: "asc" as const },
    take: 1,
    select: { url: true, alt: true, width: true, height: true, blurDataUrl: true },
  },
} as const;

const serviceCardSelect = {
  id: true,
  slug: true,
  name: true,
  shortDescription: true,
  priceMinor: true,
  currency: true,
  pricingModel: true,
  priceOnRequest: true,
  serviceAreas: true,
  imageUrl: true,
  isFeatured: true,
  category: { select: { name: true, slug: true } },
} as const;

export type ProductCard = Awaited<ReturnType<typeof listProducts>>["items"][number];
export type ServiceCard = Awaited<ReturnType<typeof listServices>>["items"][number];
export type ProductDetail = NonNullable<Awaited<ReturnType<typeof getProduct>>>;
export type ServiceDetail = NonNullable<Awaited<ReturnType<typeof getService>>>;
export type GalleryEntry = Awaited<ReturnType<typeof listGallery>>[number];

export const PRODUCTS_PER_PAGE = 12;

/**
 * Paginated product list.
 *
 * Featured first, then newest. Sellers pay for featured placement (D5), so the
 * ordering is a product decision, not an incidental one.
 */
export function listProducts(sellerId: string, slug: string, page = 1) {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;

  return unstable_cache(
    async () => {
      const where = { sellerId, ...LIVE };

      const [items, total] = await Promise.all([
        db.product.findMany({
          where,
          select: productCardSelect,
          orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
          skip: (safePage - 1) * PRODUCTS_PER_PAGE,
          take: PRODUCTS_PER_PAGE,
        }),
        db.product.count({ where }),
      ]);

      return {
        items,
        total,
        page: safePage,
        pageCount: Math.max(1, Math.ceil(total / PRODUCTS_PER_PAGE)),
      };
    },
    ["site-products", sellerId, String(safePage)],
    {
      tags: [cacheTags.tenantProducts(slug)],
      revalidate: CONTENT_REVALIDATE_SECONDS,
    },
  )();
}

/** A single product by its tenant-scoped slug. */
export function getProduct(sellerId: string, tenantSlug: string, productSlug: string) {
  return unstable_cache(
    async () =>
      db.product.findFirst({
        // sellerId in the filter, not just the slug: product slugs are unique
        // per tenant, so slug alone would match another seller's product.
        where: { sellerId, slug: productSlug, ...LIVE },
        select: {
          ...productCardSelect,
          description: true,
          sku: true,
          modelNumber: true,
          specifications: true,
          tags: true,
          metaTitle: true,
          metaDescription: true,
          updatedAt: true,
          images: {
            where: { moderationStatus: "APPROVED" as const },
            orderBy: { sortOrder: "asc" as const },
            select: {
              id: true,
              url: true,
              alt: true,
              width: true,
              height: true,
              blurDataUrl: true,
            },
          },
        },
      }),
    ["site-product", sellerId, productSlug],
    {
      tags: [cacheTags.tenantProducts(tenantSlug)],
      revalidate: CONTENT_REVALIDATE_SECONDS,
    },
  )();
}

/** Related products from the same seller, excluding the one being viewed. */
export function listRelatedProducts(sellerId: string, tenantSlug: string, excludeId: string) {
  return unstable_cache(
    async () =>
      db.product.findMany({
        where: { sellerId, ...LIVE, id: { not: excludeId } },
        select: productCardSelect,
        orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
        take: 4,
      }),
    ["site-related", sellerId, excludeId],
    {
      tags: [cacheTags.tenantProducts(tenantSlug)],
      revalidate: CONTENT_REVALIDATE_SECONDS,
    },
  )();
}

export function listServices(sellerId: string, slug: string) {
  return unstable_cache(
    async () => {
      const where = { sellerId, ...LIVE };

      const [items, total] = await Promise.all([
        db.service.findMany({
          where,
          select: serviceCardSelect,
          orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
          take: 50,
        }),
        db.service.count({ where }),
      ]);

      return { items, total };
    },
    ["site-services", sellerId],
    {
      tags: [cacheTags.tenantServices(slug)],
      revalidate: CONTENT_REVALIDATE_SECONDS,
    },
  )();
}

export function getService(sellerId: string, tenantSlug: string, serviceSlug: string) {
  return unstable_cache(
    async () =>
      db.service.findFirst({
        where: { sellerId, slug: serviceSlug, ...LIVE },
        select: {
          ...serviceCardSelect,
          description: true,
          deliverables: true,
          tags: true,
          metaTitle: true,
          metaDescription: true,
          updatedAt: true,
        },
      }),
    ["site-service", sellerId, serviceSlug],
    {
      tags: [cacheTags.tenantServices(tenantSlug)],
      revalidate: CONTENT_REVALIDATE_SECONDS,
    },
  )();
}

export function listGallery(sellerId: string, slug: string) {
  return unstable_cache(
    async () =>
      db.galleryItem.findMany({
        where: { sellerId, deletedAt: null, moderationStatus: "APPROVED" },
        orderBy: { sortOrder: "asc" },
        take: 60,
        select: {
          id: true,
          url: true,
          title: true,
          caption: true,
          alt: true,
          width: true,
          height: true,
          blurDataUrl: true,
        },
      }),
    ["site-gallery", sellerId],
    {
      tags: [cacheTags.tenantGallery(slug)],
      revalidate: CONTENT_REVALIDATE_SECONDS,
    },
  )();
}

/**
 * Everything the home page shows, in one cached call.
 *
 * Bundled deliberately: the home page is the most-hit page on every microsite,
 * and three separate cache entries mean three chances to miss. One entry, one
 * miss, one set of queries.
 */
export function getHomeContent(sellerId: string, slug: string) {
  return unstable_cache(
    async () => {
      const [products, services, gallery] = await Promise.all([
        db.product.findMany({
          where: { sellerId, ...LIVE },
          select: productCardSelect,
          orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
          take: 6,
        }),
        db.service.findMany({
          where: { sellerId, ...LIVE },
          select: serviceCardSelect,
          orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
          take: 3,
        }),
        db.galleryItem.findMany({
          where: { sellerId, deletedAt: null, moderationStatus: "APPROVED" },
          orderBy: { sortOrder: "asc" },
          take: 6,
          select: { id: true, url: true, alt: true, title: true, blurDataUrl: true },
        }),
      ]);

      return { products, services, gallery };
    },
    ["site-home", sellerId],
    {
      tags: [
        cacheTags.tenantProducts(slug),
        cacheTags.tenantServices(slug),
        cacheTags.tenantGallery(slug),
      ],
      revalidate: CONTENT_REVALIDATE_SECONDS,
    },
  )();
}

/** Live counts, used to decide which navigation items to show. */
export function getContentCounts(sellerId: string, slug: string) {
  return unstable_cache(
    async () => {
      const [products, services, gallery] = await Promise.all([
        db.product.count({ where: { sellerId, ...LIVE } }),
        db.service.count({ where: { sellerId, ...LIVE } }),
        db.galleryItem.count({
          where: { sellerId, deletedAt: null, moderationStatus: "APPROVED" },
        }),
      ]);
      return { products, services, gallery };
    },
    ["site-counts", sellerId],
    {
      tags: [
        cacheTags.tenantProducts(slug),
        cacheTags.tenantServices(slug),
        cacheTags.tenantGallery(slug),
      ],
      revalidate: CONTENT_REVALIDATE_SECONDS,
    },
  )();
}

/** Slugs for `generateStaticParams` — prebuild the catalogue of live sellers. */
export function listProductSlugs(sellerId: string, tenantSlug: string) {
  return unstable_cache(
    async () =>
      db.product.findMany({
        where: { sellerId, ...LIVE },
        select: { slug: true },
        take: 500,
      }),
    ["site-product-slugs", sellerId],
    { tags: [cacheTags.tenantProducts(tenantSlug)], revalidate: CONTENT_REVALIDATE_SECONDS },
  )();
}
