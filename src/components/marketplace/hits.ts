import type { ProductHit, SellerHit } from "@/lib/search/types";

/**
 * Adapters from the discovery service's Prisma shapes to the hit types the
 * result cards render. The cards were written for search results; the
 * discovery pages reuse them rather than growing a second card set that
 * drifts from the first.
 */

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  brand: string | null;
  priceMinor: number | null;
  priceMaxMinor: number | null;
  currency: string;
  unit: string | null;
  priceOnRequest: boolean;
  isFeatured: boolean;
  createdAt: Date;
  images: { url: string; alt: string | null }[];
  category: { name: string; path: string } | null;
  seller: {
    slug: string;
    businessName: string;
    verifiedAt: Date | null;
    location: { name: string; parent: { name: string } | null } | null;
  };
};

export function toProductHit(product: ProductRow): ProductHit {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    shortDescription: product.shortDescription,
    brand: product.brand,
    priceMinor: product.priceMinor,
    priceMaxMinor: product.priceMaxMinor,
    currency: product.currency,
    unit: product.unit,
    priceOnRequest: product.priceOnRequest,
    imageUrl: product.images[0]?.url ?? null,
    imageAlt: product.images[0]?.alt ?? null,
    isFeatured: product.isFeatured,
    createdAt: product.createdAt,
    sellerSlug: product.seller.slug,
    sellerName: product.seller.businessName,
    sellerVerified: product.seller.verifiedAt !== null,
    sellerCity: product.seller.location?.name ?? null,
    sellerState: product.seller.location?.parent?.name ?? null,
    categoryName: product.category?.name ?? null,
    categoryPath: product.category?.path ?? null,
  };
}

type SellerRow = {
  id: string;
  slug: string;
  businessName: string;
  tagline: string | null;
  logoUrl: string | null;
  productCount: number;
  serviceCount: number;
  ratingAvg: number;
  ratingCount: number;
  establishedYear: number | null;
  verifiedAt: Date | null;
  location: { name: string; parent: { name: string } | null } | null;
};

export function toSellerHit(seller: SellerRow): SellerHit {
  return {
    id: seller.id,
    slug: seller.slug,
    businessName: seller.businessName,
    tagline: seller.tagline,
    description: null,
    logoUrl: seller.logoUrl,
    city: seller.location?.name ?? null,
    state: seller.location?.parent?.name ?? null,
    productCount: seller.productCount,
    serviceCount: seller.serviceCount,
    ratingAvg: seller.ratingAvg,
    ratingCount: seller.ratingCount,
    isVerified: seller.verifiedAt !== null,
    establishedYear: seller.establishedYear,
  };
}
