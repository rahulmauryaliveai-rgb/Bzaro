import type { Prisma } from "@/generated/prisma/client";
import { sellerSiteUrl } from "@/lib/utils/url";
import { themeTokensSchema, type ThemeTokens } from "@/lib/validation/theme";

/**
 * The tenant context passed down to microsite templates.
 *
 * Templates receive this and nothing else. They never call `resolveTenant()`
 * themselves, which keeps them pure functions of their props: trivially
 * testable, trivially previewable in the dashboard, and incapable of issuing a
 * surprise query from deep inside a component tree.
 */

export type TenantNavItem = {
  href: string;
  label: string;
  /** Hidden when the seller has no content for that section. */
  enabled: boolean;
};

export type SellerPublic = {
  id: string;
  slug: string;
  businessName: string;
  legalName: string | null;
  tagline: string | null;
  description: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  websiteUrl: string | null;
  address: {
    line1: string | null;
    line2: string | null;
    postalCode: string | null;
    city: string | null;
    state: string | null;
    latitude: number | null;
    longitude: number | null;
  };
  establishedYear: number | null;
  employeeCount: string | null;
  gstin: string | null;
  /** GSTIN checked by the platform — a trust signal templates may show. */
  gstinVerified: boolean;
  certifications: string[];
  businessHours: BusinessHours | null;
  timezone: string;
  locale: string;
  socialLinks: SocialLinks;
  ratingAvg: number;
  ratingCount: number;
  productCount: number;
  serviceCount: number;
  isVerified: boolean;
};

export type BusinessHours = Record<string, Array<{ open: string; close: string }>>;

export type SocialLinks = {
  facebook?: string;
  instagram?: string;
  linkedin?: string;
  youtube?: string;
  x?: string;
};

export type TenantWebsite = {
  templateKey: string;
  templateName: string;
  metaTitle: string | null;
  metaDescription: string | null;
  ogImageUrl: string | null;
  gaMeasurementId: string | null;
  /** Decision D2 — drives robots headers and sitemap inclusion. */
  indexable: boolean;
  isPublished: boolean;
};

export type TenantCategory = { slug: string; name: string; count: number; imageUrl: string | null };

export type TenantContext = {
  seller: SellerPublic;
  website: TenantWebsite;
  theme: ThemeTokens;
  nav: TenantNavItem[];
  /**
   * The seller's product categories, for storefront headers and footers.
   * Empty until `loadPageContext` fills it — the resolver does not query
   * products.
   */
  categories: TenantCategory[];
  urls: {
    /** Absolute base URL of this tenant's site. */
    base: string;
    /** Canonical URL of the tenant home page. */
    canonical: string;
  };
};

/** Outcome of resolving a hostname to a tenant. See resolveTenant(). */
export type TenantResolution =
  | { kind: "found"; tenant: TenantContext }
  | { kind: "redirect"; toSlug: string }
  /**
   * The seller is live but their plan does not include a website (D32). The
   * layout 301s to the marketplace catalogue page, path preserved, so links
   * printed while they were on a higher tier keep working.
   */
  | { kind: "downgraded"; slug: string }
  | { kind: "suspended"; businessName: string }
  | { kind: "gone" }
  | { kind: "not_found" };

/** Shape returned by the tenant query in resolve.ts. */
type SellerRow = {
  id: string;
  slug: string;
  businessName: string;
  legalName: string | null;
  tagline: string | null;
  description: string | null;
  status: string;
  logoUrl: string | null;
  coverImageUrl: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  websiteUrl: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  establishedYear: number | null;
  employeeCount: string | null;
  gstin: string | null;
  gstinVerifiedAt: Date | null;
  certifications: string[];
  businessHours: Prisma.JsonValue;
  timezone: string;
  locale: string;
  socialLinks: Prisma.JsonValue;
  ratingAvg: number;
  ratingCount: number;
  productCount: number;
  serviceCount: number;
  verifiedAt: Date | null;
  webPresence: "CATALOGUE" | "SUBDOMAIN" | "CUSTOM_DOMAIN";
  location: { id: string; name: string; slug: string; type: string; path: string } | null;
  website: {
    id: string;
    themeTokens: Prisma.JsonValue;
    sections: Prisma.JsonValue;
    metaTitle: string | null;
    metaDescription: string | null;
    ogImageUrl: string | null;
    gaMeasurementId: string | null;
    indexable: boolean;
    customDomain: string | null;
    customDomainStatus: string;
    publishedAt: Date | null;
    template: {
      key: string;
      name: string;
      isPremium: boolean;
      defaultTokens: Prisma.JsonValue;
    };
  } | null;
};

/**
 * Map a database row to the public context.
 *
 * This is the boundary where internal columns are dropped. Anything not
 * explicitly mapped here cannot reach a template — which is the point.
 */
export function toTenantContext(row: SellerRow): TenantContext {
  /**
   * The ORIGIN, with no trailing slash.
   *
   * `tenantUrl()` returns `https://slug.host/` for the root path, and every
   * caller then writes `${urls.base}/products/…` — which produced `//products`.
   * A double slash is a genuinely different URL to a crawler, so sitemaps and
   * canonical links were advertising paths that do not match what is served.
   *
   * Normalising here rather than at each call site means the mistake cannot be
   * reintroduced by the next person who concatenates onto it.
   */
  const base = sellerSiteUrl({
    slug: row.slug,
    webPresence: row.webPresence,
    customDomain: row.website?.customDomain,
    customDomainStatus: row.website?.customDomainStatus,
  }).replace(/\/+$/, "");

  // Theme tokens are validated rather than trusted. They are stored as JSON and
  // rendered into CSS custom properties, so a malformed or hostile value is a
  // style-injection vector. On failure we fall back to the template's defaults
  // instead of throwing: a seller should never be able to break their own site
  // into a 500 by saving bad settings.
  const theme = parseTheme(row.website?.themeTokens, row.website?.template.defaultTokens);

  const seller: SellerPublic = {
    id: row.id,
    slug: row.slug,
    businessName: row.businessName,
    legalName: row.legalName,
    tagline: row.tagline,
    description: row.description,
    logoUrl: row.logoUrl,
    coverImageUrl: row.coverImageUrl,
    email: row.email,
    phone: row.phone,
    whatsapp: row.whatsapp,
    websiteUrl: row.websiteUrl,
    address: {
      line1: row.addressLine1,
      line2: row.addressLine2,
      postalCode: row.postalCode,
      city: row.location?.type === "CITY" ? row.location.name : null,
      state: row.location?.type === "STATE" ? row.location.name : null,
      latitude: row.latitude,
      longitude: row.longitude,
    },
    establishedYear: row.establishedYear,
    employeeCount: row.employeeCount,
    gstin: row.gstin,
    gstinVerified: row.gstinVerifiedAt !== null,
    certifications: row.certifications,
    businessHours: (row.businessHours as BusinessHours | null) ?? null,
    timezone: row.timezone,
    locale: row.locale,
    socialLinks: (row.socialLinks as SocialLinks | null) ?? {},
    ratingAvg: row.ratingAvg,
    ratingCount: row.ratingCount,
    productCount: row.productCount,
    serviceCount: row.serviceCount,
    isVerified: row.verifiedAt !== null,
  };

  return {
    seller,
    website: {
      templateKey: row.website?.template.key ?? "classic",
      templateName: row.website?.template.name ?? "Classic",
      metaTitle: row.website?.metaTitle ?? null,
      metaDescription: row.website?.metaDescription ?? null,
      ogImageUrl: row.website?.ogImageUrl ?? null,
      gaMeasurementId: row.website?.gaMeasurementId ?? null,
      indexable: row.website?.indexable ?? false,
      isPublished: row.website?.publishedAt !== null,
    },
    theme,
    nav: buildNav(seller),
    categories: [],
    urls: { base, canonical: base },
  };
}

function parseTheme(tokens: Prisma.JsonValue | undefined, defaults: Prisma.JsonValue | undefined) {
  const parsed = themeTokensSchema.safeParse(tokens);
  if (parsed.success) return parsed.data;

  const fallback = themeTokensSchema.safeParse(defaults);
  if (fallback.success) return fallback.data;

  return themeTokensSchema.parse({});
}

/**
 * Navigation reflects what the seller actually has. An empty "Services" tab
 * leading to an empty page is worse than no tab: it is a thin page that counts
 * against the whole site under decision D2.
 *
 * Built here from the denormalised counters on `Seller`, which are the hot-path
 * values. The layout refines it with live counts via `withLiveCounts` — those
 * counters can drift, and a nav item is exactly where drift is visible.
 */
function buildNav(seller: SellerPublic, counts?: ContentCounts): TenantNavItem[] {
  const products = counts?.products ?? seller.productCount;
  const services = counts?.services ?? seller.serviceCount;
  const gallery = counts?.gallery ?? 0;

  return [
    { href: "/", label: "Home", enabled: true },
    { href: "/about", label: "About", enabled: Boolean(seller.description) },
    { href: "/products", label: "Products", enabled: products > 0 },
    { href: "/services", label: "Services", enabled: services > 0 },
    // Gallery stays visible without a count only when we have not been told
    // otherwise; once live counts are known an empty gallery is hidden.
    { href: "/gallery", label: "Gallery", enabled: counts ? gallery > 0 : true },
    { href: "/contact", label: "Contact", enabled: true },
  ];
}

export type ContentCounts = { products: number; services: number; gallery: number };

/**
 * Recompute navigation from live content counts.
 *
 * Returns a new context rather than mutating: the resolved tenant is cached and
 * shared across requests, so mutating it would leak one request's counts into
 * every other reader.
 */
export function withLiveCounts(
  context: TenantContext,
  counts: ContentCounts,
  categories: TenantCategory[] = context.categories,
): TenantContext {
  return { ...context, nav: buildNav(context.seller, counts), categories };
}
