import type { NextConfig } from "next";

/**
 * Next.js configuration.
 *
 * Read alongside src/proxy.ts — between them they define how a request becomes
 * a tenant page.
 */

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
const PROTOCOL = process.env.NEXT_PUBLIC_PROTOCOL ?? "https";
const CLOUDINARY_CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

/** Root domain with any port stripped, mirroring src/lib/utils/url.ts. */
const bareDomain = ROOT_DOMAIN.replace(/:\d+$/, "");

/**
 * Server Actions reject requests whose Origin does not match the Host. Under
 * wildcard subdomains every tenant is a distinct origin, so without this list
 * the contact form on every microsite fails with an opaque 403 — and it fails
 * ONLY in the browser, so it passes every server-side test.
 *
 * This is the single most common way this architecture breaks in production.
 */
const allowedOrigins = [
  ROOT_DOMAIN,
  `www.${ROOT_DOMAIN}`,
  `*.${ROOT_DOMAIN}`,
  bareDomain,
  `*.${bareDomain}`,
];

/**
 * Baseline security headers.
 *
 * A nonce-based CSP is Phase 10: it requires generating a per-request nonce in
 * the proxy, which conflicts with caching static HTML and needs to be done
 * carefully rather than bolted on. Everything below is safe to apply now and
 * costs nothing.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  // Tenant microsites must never be framed — a seller site inside an attacker's
  // iframe is a clickjacking surface against that seller's customers.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
];

const productionHeaders = [
  ...securityHeaders,
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

/**
 * Hosts allowed to request Next.js dev resources (HMR socket, dev fonts,
 * the error overlay).
 *
 * `next dev` serves on localhost and, by default, refuses these requests from
 * any other origin. This application is never used on localhost: the tenant is
 * resolved from the hostname, so development happens on `lvh.me` and its
 * wildcard subdomains. Without this list every dev session loads the HTML but
 * is refused the dev runtime, and the page renders BLANK after hydration —
 * with the reason visible only in the terminal, not the browser.
 *
 * Production builds are unaffected, which is why the end-to-end suite (which
 * runs against `next start`) never caught this.
 *
 * Derived from the configured root domain so it keeps working if that changes.
 * Development only — Next.js ignores it in production builds.
 */
const devOrigin = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "lvh.me:3000").split(":")[0];

const allowedDevOrigins = [
  devOrigin,
  // Tenant microsites each live on their own subdomain.
  `*.${devOrigin}`,
];

const nextConfig: NextConfig = {
  reactStrictMode: true,

  allowedDevOrigins,

  experimental: {
    // Enables forbidden() and unauthorized() from next/navigation, used by
    // src/lib/auth/guards.ts to fail closed with the correct status code.
    authInterrupts: true,
    serverActions: {
      allowedOrigins,
      bodySizeLimit: "2mb",
    },
  },

  images: {
    // Uploads go directly from the browser to the CDN and are served from
    // there; the Next.js server never proxies image bytes.
    remotePatterns: CLOUDINARY_CLOUD
      ? [
          {
            protocol: "https",
            hostname: "res.cloudinary.com",
            pathname: `/${CLOUDINARY_CLOUD}/**`,
          },
        ]
      : [],
    formats: ["image/avif", "image/webp"],
    // Long cache: media is content-addressed by Cloudinary public ID, so a
    // changed image is a changed URL.
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: process.env.NODE_ENV === "production" ? productionHeaders : securityHeaders,
      },
      {
        // Private surfaces must never be indexed, and must never be cached by
        // an intermediary — a shared cache holding one seller's dashboard is a
        // cross-tenant leak.
        source: "/dashboard/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
        ],
      },
      {
        source: "/admin/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
        ],
      },
    ];
  },

  // Fail the build on type errors. A foundation that tolerates broken types
  // stops being a foundation within a month. Linting runs as its own CI step
  // (`npm run lint`) — Next 16 no longer accepts an `eslint` config block.
  typescript: { ignoreBuildErrors: false },

  // Never leak framework version in response headers.
  poweredByHeader: false,
};

export default nextConfig;

export { allowedOrigins, PROTOCOL };
