import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { cacheTags } from "@/lib/cache/tags";

/**
 * Marketplace lookups for seller profiles and product/service detail pages.
 *
 * Distinct from `site-content.service.ts`, which serves the microsites. These
 * queries are keyed by SELLER SLUG rather than by an already-resolved tenant,
 * because on the marketplace the seller is part of the URL rather than the
 * hostname.
 *
 * The same two invariants apply: only VERIFIED, non-deleted sellers, and only
 * live, moderation-approved content.
 */

const REVALIDATE = 3600;

/** Seller profile for `/seller/[slug]`. */
export function getMarketplaceSeller(slug: string) {
  return unstable_cache(
    async () =>
      db.seller.findFirst({
        where: { slug, status: "VERIFIED", deletedAt: null },
        select: {
          id: true,
          slug: true,
          businessName: true,
          legalName: true,
          tagline: true,
          description: true,
          logoUrl: true,
          coverImageUrl: true,
          phone: true,
          whatsapp: true,
          email: true,
          addressLine1: true,
          addressLine2: true,
          postalCode: true,
          establishedYear: true,
          employeeCount: true,
          gstin: true,
          businessHours: true,
          timezone: true,
          socialLinks: true,
          productCount: true,
          serviceCount: true,
          ratingAvg: true,
          ratingCount: true,
          verifiedAt: true,
          createdAt: true,
          location: { select: { name: true, path: true, parent: { select: { name: true } } } },
          categories: {
            select: { category: { select: { name: true, path: true } }, isPrimary: true },
            take: 10,
          },
          website: { select: { customDomain: true, customDomainStatus: true } },
        },
      }),
    ["marketplace-seller", slug],
    { tags: [cacheTags.tenant(slug)], revalidate: REVALIDATE },
  )();
}

/** Product detail for `/product/[seller]/[slug]`. */
export function getMarketplaceProduct(sellerSlug: string, productSlug: string) {
  return unstable_cache(
    async () =>
      db.product.findFirst({
        where: {
          slug: productSlug,
          status: "PUBLISHED",
          deletedAt: null,
          moderationStatus: "APPROVED",
          // The seller filter is part of the lookup, not an afterthought:
          // product slugs are unique per tenant, so matching on slug alone
          // would return another seller's product.
          seller: { slug: sellerSlug, status: "VERIFIED", deletedAt: null },
        },
        select: {
          id: true,
          slug: true,
          name: true,
          shortDescription: true,
          description: true,
          brand: true,
          sku: true,
          modelNumber: true,
          priceMinor: true,
          priceMaxMinor: true,
          currency: true,
          unit: true,
          minOrderQty: true,
          priceOnRequest: true,
          specifications: true,
          tags: true,
          metaTitle: true,
          metaDescription: true,
          updatedAt: true,
          images: {
            where: { moderationStatus: "APPROVED" },
            orderBy: { sortOrder: "asc" },
            select: { id: true, url: true, alt: true, width: true, height: true },
          },
          category: { select: { name: true, path: true, ancestorIds: true } },
          seller: {
            select: {
              id: true,
              slug: true,
              businessName: true,
              logoUrl: true,
              phone: true,
              whatsapp: true,
              verifiedAt: true,
              ratingAvg: true,
              ratingCount: true,
              productCount: true,
              location: { select: { name: true, parent: { select: { name: true } } } },
            },
          },
        },
      }),
    ["marketplace-product", sellerSlug, productSlug],
    { tags: [cacheTags.tenantProducts(sellerSlug)], revalidate: REVALIDATE },
  )();
}

/** Service detail for `/service/[seller]/[slug]`. */
export function getMarketplaceService(sellerSlug: string, serviceSlug: string) {
  return unstable_cache(
    async () =>
      db.service.findFirst({
        where: {
          slug: serviceSlug,
          status: "PUBLISHED",
          deletedAt: null,
          moderationStatus: "APPROVED",
          seller: { slug: sellerSlug, status: "VERIFIED", deletedAt: null },
        },
        select: {
          id: true,
          slug: true,
          name: true,
          shortDescription: true,
          description: true,
          priceMinor: true,
          currency: true,
          pricingModel: true,
          priceOnRequest: true,
          serviceAreas: true,
          deliverables: true,
          metaTitle: true,
          metaDescription: true,
          category: { select: { name: true, path: true } },
          seller: {
            select: {
              id: true,
              slug: true,
              businessName: true,
              logoUrl: true,
              phone: true,
              whatsapp: true,
              verifiedAt: true,
              location: { select: { name: true, parent: { select: { name: true } } } },
            },
          },
        },
      }),
    ["marketplace-service", sellerSlug, serviceSlug],
    { tags: [cacheTags.tenantServices(sellerSlug)], revalidate: REVALIDATE },
  )();
}

/** A seller's products, for their marketplace profile page. */
export function getSellerProducts(sellerId: string, sellerSlug: string, limit = 12) {
  return unstable_cache(
    async () =>
      db.product.findMany({
        where: {
          sellerId,
          status: "PUBLISHED",
          deletedAt: null,
          moderationStatus: "APPROVED",
        },
        orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
        take: limit,
        select: {
          id: true,
          slug: true,
          name: true,
          shortDescription: true,
          priceMinor: true,
          priceMaxMinor: true,
          currency: true,
          unit: true,
          priceOnRequest: true,
          images: {
            where: { moderationStatus: "APPROVED" },
            orderBy: { sortOrder: "asc" },
            take: 1,
            select: { url: true, alt: true },
          },
        },
      }),
    ["marketplace-seller-products", sellerId, String(limit)],
    { tags: [cacheTags.tenantProducts(sellerSlug)], revalidate: REVALIDATE },
  )();
}

/** Featured content for the marketplace homepage. */
export function getHomepageContent() {
  return unstable_cache(
    async () => {
      const [sellers, products, sellerCount, productCount] = await Promise.all([
        db.seller.findMany({
          where: { status: "VERIFIED", deletedAt: null },
          orderBy: [{ ratingAvg: "desc" }, { productCount: "desc" }],
          take: 6,
          select: {
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
            location: { select: { name: true, parent: { select: { name: true } } } },
          },
        }),
        db.product.findMany({
          where: {
            status: "PUBLISHED",
            deletedAt: null,
            moderationStatus: "APPROVED",
            seller: { status: "VERIFIED", deletedAt: null },
          },
          orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
          take: 8,
          select: {
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
          },
        }),
        db.seller.count({ where: { status: "VERIFIED", deletedAt: null } }),
        db.product.count({
          where: {
            status: "PUBLISHED",
            deletedAt: null,
            moderationStatus: "APPROVED",
            seller: { status: "VERIFIED", deletedAt: null },
          },
        }),
      ]);

      return { sellers, products, sellerCount, productCount };
    },
    ["marketplace-homepage"],
    { tags: [cacheTags.home()], revalidate: 900 },
  )();
}
