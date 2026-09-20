// Imports the edge-safe half of the environment deliberately: this module is
// used by the proxy, which runs before any server secret is available.
import { clientEnv } from "@/env.client";

/**
 * Hostname parsing and URL construction.
 *
 * EVERY hostname comparison and every tenant URL in the application goes
 * through this module. Nothing else may read NEXT_PUBLIC_ROOT_DOMAIN or build a
 * subdomain URL by hand.
 *
 * The reason is the port. In development the root domain is `lvh.me:3000`; in
 * production it is `bzaro.in`. Host headers may or may not carry a port,
 * may carry an IPv6 literal in brackets, and may carry a trailing dot (a fully
 * qualified DNS name). Normalising in one place is the difference between this
 * working everywhere and breaking in exactly one environment.
 */

/** Root domain with any port stripped: `lvh.me:3000` → `lvh.me`. */
export const ROOT_DOMAIN = stripPort(clientEnv.NEXT_PUBLIC_ROOT_DOMAIN);

/** Root domain as configured, port included. Use when building absolute URLs. */
export const ROOT_HOST = clientEnv.NEXT_PUBLIC_ROOT_DOMAIN.toLowerCase();

export const PROTOCOL = clientEnv.NEXT_PUBLIC_PROTOCOL;

/**
 * Strip a port from a host string, correctly handling IPv6 literals
 * (`[::1]:3000` → `[::1]`) and a trailing FQDN dot.
 */
export function stripPort(host: string): string {
  let h = host.trim().toLowerCase();

  // Remove a trailing dot: "bzaro.in." is the same host as
  // "bzaro.in" but would fail a naive string comparison.
  if (h.endsWith(".")) h = h.slice(0, -1);

  if (h.startsWith("[")) {
    const close = h.indexOf("]");
    return close === -1 ? h : h.slice(0, close + 1);
  }

  const colon = h.lastIndexOf(":");
  return colon === -1 ? h : h.slice(0, colon);
}

/**
 * Normalise a raw `Host` header into a comparable hostname.
 * Returns null when the header is absent or empty.
 */
export function normalizeHost(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const host = stripPort(raw);
  return host.length > 0 ? host : null;
}

/** True when `host` is the apex or its `www` alias. */
export function isRootHost(host: string): boolean {
  return host === ROOT_DOMAIN || host === `www.${ROOT_DOMAIN}`;
}

/**
 * Extract the subdomain label from a host under the root domain.
 *
 * Returns null when the host is not under the root domain, is the apex itself,
 * or carries more than one label (`a.b.bzaro.in`). Multi-label hosts are
 * rejected deliberately: a wildcard TLS certificate covers exactly one level,
 * so `a.b.bzaro.in` has no valid certificate and must not resolve to a
 * tenant.
 */
export function getSubdomain(host: string): string | null {
  if (!host.endsWith(`.${ROOT_DOMAIN}`)) return null;

  const label = host.slice(0, -(ROOT_DOMAIN.length + 1));
  if (label.length === 0) return null;
  if (label.includes(".")) return null;

  return label;
}

/** Absolute URL for a path on the apex marketplace. */
export function marketplaceUrl(path = "/"): string {
  return `${PROTOCOL}://${ROOT_HOST}${normalizePath(path)}`;
}

/** Absolute URL for a path on a tenant's microsite. */
export function tenantUrl(slug: string, path = "/"): string {
  return `${PROTOCOL}://${slug}.${ROOT_HOST}${normalizePath(path)}`;
}

/**
 * Absolute URL for a tenant, honouring a verified custom domain when present.
 * Custom domains always use https — they are only ever provisioned with TLS.
 */
export function tenantUrlFor(
  tenant: { slug: string; customDomain?: string | null; customDomainStatus?: string | null },
  path = "/",
): string {
  if (tenant.customDomain && tenant.customDomainStatus === "ACTIVE") {
    return `https://${tenant.customDomain}${normalizePath(path)}`;
  }
  return tenantUrl(tenant.slug, path);
}

/** Mirrors the Prisma `WebPresence` enum without importing the client here. */
export type WebPresenceTier = "CATALOGUE" | "SUBDOMAIN" | "CUSTOM_DOMAIN";

export type SellerSurface = {
  slug: string;
  webPresence: WebPresenceTier;
  customDomain?: string | null;
  customDomainStatus?: string | null;
};

/**
 * Translate a microsite path to its marketplace equivalent.
 *
 *   /                    → /seller/{slug}
 *   /products/{p}        → /product/{slug}/{p}
 *   /services/{s}        → /service/{slug}/{s}
 *   anything else        → /seller/{slug}   (about, contact, gallery, listings)
 *
 * Used both to build canonical URLs for catalogue-tier sellers and to 301 a
 * downgraded seller's subdomain without dropping deep links (D32).
 */
export function marketplacePathFor(slug: string, sitePath = "/"): string {
  const path = normalizePath(sitePath).split(/[?#]/)[0] ?? "/";
  const product = path.match(/^\/products\/([^/]+)\/?$/);
  if (product) return `/product/${slug}/${product[1]}`;
  const service = path.match(/^\/services\/([^/]+)\/?$/);
  if (service) return `/service/${slug}/${service[1]}`;
  return `/seller/${slug}`;
}

/**
 * The seller's public home for a microsite path — decision D32.
 *
 * Catalogue tier    → the marketplace page (the seller has no site)
 * Subdomain tier    → {slug}.bzaro.in
 * Custom-domain tier→ the verified custom domain, else the subdomain
 *
 * This is THE canonical rule. Marketplace pages, microsite metadata, sitemaps,
 * JSON-LD and dashboard "view your site" links must all go through it, so the
 * canonical target and the served URL can never disagree.
 */
export function sellerSiteUrl(seller: SellerSurface, sitePath = "/"): string {
  if (seller.webPresence === "CATALOGUE") {
    return marketplaceUrl(marketplacePathFor(seller.slug, sitePath));
  }
  if (seller.webPresence === "CUSTOM_DOMAIN") {
    return tenantUrlFor(seller, sitePath);
  }
  return tenantUrl(seller.slug, sitePath);
}

function normalizePath(path: string): string {
  if (!path || path === "/") return "/";
  return path.startsWith("/") ? path : `/${path}`;
}

/**
 * Build a canonical URL, discarding query strings and hashes.
 * Canonical URLs must be stable — a canonical that varies by query parameter
 * defeats its own purpose.
 */
export function canonical(base: string, path = "/"): string {
  const url = new URL(normalizePath(path), base);
  url.search = "";
  url.hash = "";
  // Trailing slashes are stripped everywhere except the root, matching the
  // Next.js default so canonical and served URL never disagree.
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }
  return url.toString();
}
