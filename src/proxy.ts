import { NextResponse, type NextRequest } from "next/server";
import {
  getSubdomain,
  isRootHost,
  marketplaceUrl,
  normalizeHost,
  stripPort,
} from "@/lib/utils/url";
import { isReservedSubdomain } from "@/lib/tenant/reserved";
import { IS_PRODUCTION } from "@/env.client";

/**
 * Hostname → zone classification. The routing spine of the whole platform.
 *
 * (In Next.js 16 this file is `proxy.ts`; it is the same mechanism previously
 * called `middleware.ts`.)
 *
 * ── Rule 1: no database access here ──────────────────────────────────────────
 * This runs on the Edge runtime, on every matched request. Prisma is not
 * edge-compatible, and a per-request tenant lookup here would put a database
 * round trip on the critical path of every page load. Classification is pure
 * string work; the actual tenant record is resolved later, in a React Server
 * Component, where it can be cached.
 *
 * ── Rule 2: the tenant travels in the pathname, never in a header ────────────
 * A header-carried tenant is invisible to the Next.js cache key. Two tenants
 * would then collide in the ISR/data cache and one seller's page would be
 * served on another seller's domain — a data leak, not merely a bug.
 *
 * Rewriting `abc.bzaro.in/products` to `/site/abc/products` makes the
 * tenant part of the cache key by construction, so isolation is a property of
 * the URL space rather than something every future contributor must remember.
 * The browser's address bar is unaffected; this is an internal rewrite.
 *
 * Any change to this file must keep tests/e2e/tenant-isolation.spec.ts green.
 */

/** Prefix marking a host that must be resolved as a full custom domain. */
export const CUSTOM_DOMAIN_PREFIX = "host:";

/**
 * Internal path space for tenant microsites.
 *
 * Note it is NOT `_sites`: a leading underscore marks a private folder in the
 * App Router, which opts the whole subtree out of routing — the routes simply
 * never exist, and the failure is silent.
 *
 * Because the segment is therefore public, apex requests to it are blocked
 * below. Otherwise every microsite would be reachable a second time at
 * bzaro.in/site/<slug>, duplicating the entire catalogue against the
 * canonical strategy in decision D1.
 */
export const SITE_SEGMENT = "/site";

/**
 * Carries the visitor's ORIGINAL path into the rewritten request.
 *
 * After the rewrite the pathname becomes `/site/{tenant}/about`, and a layout
 * only receives its own params — it cannot see which page below it was asked
 * for. The rename redirect needs that path: without it every old URL collapses
 * onto the homepage, which throws away the ranking of every deep page the
 * seller had and reads to Google as a soft 404.
 */
export const TENANT_PATH_HEADER = "x-tenant-path";

/** First-touch marketplace attribution, 30 days. See `withReferralCookie`. */
export const REFERRAL_COOKIE = "bz_ref";

/** Authenticated surfaces that must never be cached or indexed. */
const PRIVATE_PREFIXES = ["/dashboard", "/admin"] as const;

function isPrivateSurface(pathname: string): boolean {
  return PRIVATE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Loopback hostnames, which are never a tenant and never the root domain.
 *
 * Visiting one is the single most likely first move for anyone starting the
 * app — `next dev` prints http://localhost:3000 itself. Left alone it falls
 * through to the custom-domain branch, finds no tenant, and returns a bare 404
 * with nothing to suggest that the root domain is somewhere else entirely.
 */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "0.0.0.0"]);

/**
 * Next.js renders a Server Action's `redirect()` target by fetching ITSELF
 * over loopback, with the visitor's real host in `x-forwarded-host` and the
 * visitor's cookies attached. Classifying that request by its loopback Host
 * would be wrong twice over: in development the loopback redirect below
 * bounces it to the root domain and `fetch` drops the cookie on the way, so
 * the page renders with no session and every guard sends the user to /login;
 * in production a loopback host is not the root host and would fall into the
 * custom-domain branch and 404.
 *
 * So a loopback Host defers to `x-forwarded-host` when that names a real
 * host. Only loopback requests are affected — nothing reaching the origin
 * through nginx carries a loopback Host — so this cannot be used to spoof a
 * tenant from outside.
 */
function resolveLoopbackHost(host: string, forwardedHeader: string | null): string {
  if (!LOOPBACK_HOSTS.has(stripPort(host))) return host;
  const forwarded = normalizeHost(forwardedHeader);
  if (forwarded && !LOOPBACK_HOSTS.has(stripPort(forwarded))) return forwarded;
  return host;
}

export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  const rawHost = normalizeHost(request.headers.get("host"));

  // No usable Host header. Serve the marketplace rather than guessing a tenant.
  if (!rawHost) return NextResponse.next();

  const host = resolveLoopbackHost(rawHost, request.headers.get("x-forwarded-host"));

  // ── Zone 0: loopback in development → send them to the root domain ────────
  // Development only. In production a loopback Host is either a health probe
  // or something misrouted, and redirecting it would mask a real problem.
  if (!IS_PRODUCTION && LOOPBACK_HOSTS.has(stripPort(host))) {
    const target = new URL(url.pathname + url.search, marketplaceUrl());
    return NextResponse.redirect(target, 307);
  }

  if (isRootHost(host)) {
    // The tenant path space is an internal rewrite target, not a public URL.
    // Requesting it directly on the apex is treated as not found.
    if (url.pathname === SITE_SEGMENT || url.pathname.startsWith(`${SITE_SEGMENT}/`)) {
      return NextResponse.rewrite(new URL("/404-internal", request.url));
    }

    // Private surfaces must never be stored by a shared cache — one seller's
    // dashboard held in an intermediary is a cross-tenant leak.
    //
    // These headers are set HERE rather than in next.config.ts because Next.js
    // emits its own `Cache-Control` for dynamic routes, which overrides the
    // config-level header. Setting it on the proxy response wins.
    if (isPrivateSurface(url.pathname)) {
      const response = NextResponse.next();
      response.headers.set("Cache-Control", "private, no-store, max-age=0");
      response.headers.set("X-Robots-Tag", "noindex, nofollow");
      return response;
    }

    return NextResponse.next();
  }

  const label = getSubdomain(host);

  if (label !== null) {
    // ── Zone 2: reserved label → platform surface, not a tenant ──────────────
    // Reserved labels fall through to the marketplace routes so that, for
    // example, an accidentally-pointed `api.bzaro.in` never resolves to
    // a seller microsite.
    if (isReservedSubdomain(label)) {
      return NextResponse.next();
    }

    // ── Zone 3: tenant microsite ─────────────────────────────────────────────
    const originalPath = url.pathname;
    url.pathname = `${SITE_SEGMENT}/${label}${originalPath}`;
    return rewriteWithPath(request, url, originalPath);
  }

  // ── Zone 4: custom domain ──────────────────────────────────────────────────
  // Any host not under the root domain is treated as a seller's own domain and
  // resolved by full hostname (decision D3). Provisioning ships in Phase 10,
  // but the resolver is hostname-generic from day one so enabling it later is
  // configuration rather than a rewrite of tenant routing.
  //
  // The host is encoded rather than interpolated raw: a hostname can contain
  // characters that are legal in a Host header but would alter the meaning of
  // the rewritten path.
  const originalPath = url.pathname;
  url.pathname = `${SITE_SEGMENT}/${CUSTOM_DOMAIN_PREFIX}${encodeURIComponent(host)}${originalPath}`;
  return rewriteWithPath(request, url, originalPath);
}

/**
 * Rewrite while passing the original path along as a request header.
 *
 * Set on the REQUEST (not the response) so it reaches the server components
 * and never leaks to the client.
 */
function rewriteWithPath(request: NextRequest, url: URL, originalPath: string) {
  const headers = new Headers(request.headers);

  // Overwrite rather than append: a client-supplied header of the same name
  // must not be able to influence where a redirect points.
  headers.set(TENANT_PATH_HEADER, originalPath);

  return withReferralCookie(request, NextResponse.rewrite(url, { request: { headers } }));
}

/**
 * First-touch `?ref=bzaro` attribution.
 *
 * Set on the seller's storefront when the visitor arrived from the marketplace,
 * so the seller can be shown which leads Bzaro sent them. FIRST touch, not
 * last: an existing cookie is never overwritten, because the marketplace's
 * claim to the introduction belongs to the visit that made it, and re-writing
 * on every later visit would let any link re-attribute an existing customer.
 *
 * Not signed, and it only ever adds a label to a lead the seller already has.
 */
function withReferralCookie(request: NextRequest, response: NextResponse) {
  if (request.nextUrl.searchParams.get("ref") !== "bzaro") return response;
  if (request.cookies.has(REFERRAL_COOKIE)) return response;

  response.cookies.set(REFERRAL_COOKIE, "bzaro", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: IS_PRODUCTION,
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}

export const config = {
  /**
   * Skip everything that must not be rewritten:
   *   api      — route handlers are host-agnostic and read the Host header
   *              directly when they need to
   *   _next    — framework assets
   *   _static  — static assets
   *   *.*      — any path with a file extension (favicon.ico, robots.txt, …)
   *
   * Keeping assets out of the proxy matters for cost as much as correctness:
   * on a per-invocation platform, running this on every image request is pure
   * waste.
   */
  matcher: ["/((?!api|_next|_static|.*\\..*).*)"],
};

export default proxy;
