import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { resolveTenant, tenantParamFromHost } from "@/lib/tenant/resolve";
import { marketplaceUrl } from "@/lib/utils/url";

/**
 * Host-aware robots.txt.
 *
 * One handler serves every hostname on the platform, because it has to: Next.js
 * only supports the `robots` metadata convention at the app root, and the proxy
 * deliberately does not rewrite paths carrying a file extension. So this file
 * inspects the Host header itself and answers as the marketplace or as a
 * specific tenant.
 *
 * ── This is where decision D2 is enforced for crawlers ───────────────────────
 * An unverified or incomplete microsite returns a blanket disallow, so it never
 * enters the index and never contributes a thin-content signal against the root
 * domain. `indexable` is computed in the write path and persisted, so this is a
 * field read rather than a scoring pass on a file crawlers hit constantly.
 */

// Varies by Host, so it must never be cached as one static file for every host.
export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get("host");
  const param = tenantParamFromHost(host);

  // ── Apex: the public marketplace ──
  if (!param) {
    return {
      rules: [
        {
          userAgent: "*",
          allow: "/",
          disallow: [
            "/dashboard",
            "/admin",
            "/api/",
            "/login",
            "/register",
            // Faceted search produces effectively unlimited URL permutations.
            // Letting crawlers enumerate them burns crawl budget that should go
            // to seller and product pages.
            "/search?",
            "/*?page=",
          ],
        },
      ],
      sitemap: marketplaceUrl("/sitemap.xml"),
      host: marketplaceUrl(),
    };
  }

  // ── Tenant microsite ──
  const result = await resolveTenant(param);

  if (result.kind !== "found" || !result.tenant.website.indexable) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  const { urls } = result.tenant;

  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/*?*"] }],
    sitemap: `${urls.base}/sitemap.xml`,
    host: urls.base,
  };
}
