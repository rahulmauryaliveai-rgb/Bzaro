import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { cacheTags } from "@/lib/cache/tags";
import { CUSTOM_DOMAIN_PREFIX } from "@/proxy";
import { getSubdomain, isRootHost, normalizeHost } from "@/lib/utils/url";
import { isReservedSubdomain } from "@/lib/tenant/reserved";
import type { TenantContext, TenantResolution } from "@/lib/tenant/context";
import { toTenantContext } from "@/lib/tenant/context";

/**
 * Tenant resolution: rewritten path parameter → tenant record.
 *
 * ── Two cache layers, on purpose ─────────────────────────────────────────────
 *   React.cache      deduplicates within a single render pass, so a layout and
 *                    five nested components resolving the same tenant issue one
 *                    query, not six.
 *   unstable_cache   deduplicates across requests and across users, keyed and
 *                    tagged so `revalidateTag('tenant:abc')` invalidates
 *                    exactly one seller when they hit save.
 *
 * ── Why the parameter, not the Host header ───────────────────────────────────
 * The proxy encodes the tenant into the pathname precisely so that the Next.js
 * cache key includes it. Resolving from `headers()` here would reintroduce the
 * collision this architecture exists to prevent — see src/proxy.ts.
 */

const TENANT_REVALIDATE_SECONDS = 3600;

/**
 * Public projection of a seller. Deliberately narrow.
 *
 * Microsite templates receive only this. A template cannot leak a column it was
 * never handed, which makes exposure of internal fields — verification notes,
 * profile scores, contact email used for billing — structurally impossible
 * rather than a matter of reviewer vigilance.
 */
const publicSellerSelect = {
  id: true,
  slug: true,
  businessName: true,
  legalName: true,
  tagline: true,
  description: true,
  status: true,
  logoUrl: true,
  coverImageUrl: true,
  email: true,
  phone: true,
  whatsapp: true,
  websiteUrl: true,
  addressLine1: true,
  addressLine2: true,
  postalCode: true,
  latitude: true,
  longitude: true,
  establishedYear: true,
  employeeCount: true,
  gstin: true,
  businessHours: true,
  timezone: true,
  locale: true,
  socialLinks: true,
  ratingAvg: true,
  ratingCount: true,
  productCount: true,
  serviceCount: true,
  verifiedAt: true,
  location: {
    select: { id: true, name: true, slug: true, type: true, path: true },
  },
  website: {
    select: {
      id: true,
      themeTokens: true,
      sections: true,
      metaTitle: true,
      metaDescription: true,
      ogImageUrl: true,
      gaMeasurementId: true,
      indexable: true,
      customDomain: true,
      customDomainStatus: true,
      publishedAt: true,
      template: {
        select: { key: true, name: true, isPremium: true, defaultTokens: true },
      },
    },
  },
} as const;

/** Load a live tenant by subdomain label. Cross-request cached and tagged. */
const loadBySlug = (slug: string) =>
  unstable_cache(
    async () =>
      db.seller.findFirst({
        where: { slug, deletedAt: null },
        select: publicSellerSelect,
      }),
    ["tenant-by-slug", slug],
    { tags: [cacheTags.tenant(slug)], revalidate: TENANT_REVALIDATE_SECONDS },
  )();

/** Load a live tenant by verified custom domain (decision D3). */
const loadByCustomDomain = (host: string) =>
  unstable_cache(
    async () =>
      db.seller.findFirst({
        where: {
          deletedAt: null,
          website: { customDomain: host, customDomainStatus: "ACTIVE" },
        },
        select: publicSellerSelect,
      }),
    ["tenant-by-domain", host],
    { tags: [`tenant-domain:${host}`], revalidate: TENANT_REVALIDATE_SECONDS },
  )();

/**
 * Look up a retired slug so renamed sellers keep their inbound links.
 * Cached separately: this is a miss path, and caching misses is what stops a
 * crawler hammering nonexistent subdomains from reaching the database.
 */
const loadSlugHistory = (slug: string) =>
  unstable_cache(
    async () =>
      db.sellerSlugHistory.findUnique({
        where: { slug },
        select: { seller: { select: { slug: true, deletedAt: true } } },
      }),
    ["slug-history", slug],
    { tags: [`slug-history:${slug}`], revalidate: TENANT_REVALIDATE_SECONDS },
  )();

/**
 * Resolve the `[tenant]` route parameter written by the proxy.
 *
 * Returns a discriminated result rather than throwing, because each outcome
 * needs a different HTTP status and each status carries SEO meaning:
 *
 *   found      → 200
 *   redirect   → 301, retired slug (link equity preserved)
 *   suspended  → 403 with noindex
 *   gone       → 410, deliberately not 404: 410 tells crawlers to drop the URL
 *                far faster, which matters when sellers churn
 *   not_found  → 404
 *
 * Memoised per render with React.cache so layout and page share one lookup.
 */
export const resolveTenant = cache(async (param: string): Promise<TenantResolution> => {
  const decoded = decodeURIComponent(param);

  const seller = decoded.startsWith(CUSTOM_DOMAIN_PREFIX)
    ? await loadByCustomDomain(decoded.slice(CUSTOM_DOMAIN_PREFIX.length).toLowerCase())
    : await loadBySlug(decoded.toLowerCase());

  if (!seller) {
    // Not a live slug. It may be a slug the seller has since changed.
    if (!decoded.startsWith(CUSTOM_DOMAIN_PREFIX)) {
      const history = await loadSlugHistory(decoded.toLowerCase());
      if (history?.seller && !history.seller.deletedAt) {
        return { kind: "redirect", toSlug: history.seller.slug };
      }
    }
    return { kind: "not_found" };
  }

  switch (seller.status) {
    case "VERIFIED":
      return { kind: "found", tenant: toTenantContext(seller) };

    case "SUSPENDED":
    case "BANNED":
      return { kind: "suspended", businessName: seller.businessName };

    // A microsite is not public until the seller is verified. This is the
    // routing half of decision D2 — the indexability half lives in robots.ts.
    case "DRAFT":
    case "PENDING_VERIFICATION":
    case "REJECTED":
    default:
      return { kind: "not_found" };
  }
});

/**
 * Convenience wrapper for pages that only care about the happy path.
 * Returns null for every non-found outcome; the layout has already rendered
 * the correct status page by the time a child calls this.
 */
export async function getTenant(param: string): Promise<TenantContext | null> {
  const result = await resolveTenant(param);
  return result.kind === "found" ? result.tenant : null;
}

/**
 * Derive the tenant parameter from a raw Host header.
 *
 * Needed by the handful of endpoints the proxy deliberately does not rewrite —
 * `robots.txt` and `sitemap.xml` are matched out by the file-extension rule, and
 * Next.js only supports those metadata conventions at the app root anyway. Those
 * handlers therefore have to look at the host themselves.
 *
 * Returns null for the apex, `www`, and reserved labels, which are the
 * marketplace's own and not any tenant's.
 */
export function tenantParamFromHost(rawHost: string | null | undefined): string | null {
  const host = normalizeHost(rawHost);
  if (!host || isRootHost(host)) return null;

  const label = getSubdomain(host);
  if (label !== null) {
    return isReservedSubdomain(label) ? null : label;
  }

  return `${CUSTOM_DOMAIN_PREFIX}${host}`;
}

export type PublicSeller = Awaited<ReturnType<typeof loadBySlug>>;
