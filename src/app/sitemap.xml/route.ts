import { headers } from "next/headers";
import { resolveTenant, tenantParamFromHost } from "@/lib/tenant/resolve";
import {
  countIndexableProducts,
  countIndexableSellers,
  listTenantSitemapEntries,
  SITEMAP_PAGE_SIZE,
} from "@/server/services/sitemap.service";
import {
  emptySitemap,
  renderSitemap,
  renderSitemapIndex,
  xmlResponse,
  type SitemapEntry,
} from "@/lib/seo/sitemap";
import { marketplaceUrl } from "@/lib/utils/url";

/**
 * Host-aware sitemap.
 *
 * One handler, two behaviours:
 *
 *   apex    → a sitemap INDEX pointing at sharded child sitemaps
 *   tenant  → that seller's own URLs, or an empty sitemap when not indexable
 *
 * Written as a route handler rather than via the `sitemap.ts` metadata
 * convention because that convention cannot see the request host — and, as with
 * robots.txt, it is only registered at the true app root anyway. The proxy
 * excludes paths with file extensions, so `abc.bzaro.in/sitemap.xml`
 * arrives here unrewritten with the tenant host intact.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const host = (await headers()).get("host");
  const param = tenantParamFromHost(host);

  // ── Tenant sitemap ──
  if (param) {
    const result = await resolveTenant(param);

    // Not indexable → a valid but empty sitemap, not a 404. A 404 on a URL
    // advertised in robots.txt is a crawl error; an empty sitemap is simply an
    // honest statement that there is nothing to crawl yet.
    if (result.kind !== "found" || !result.tenant.website.indexable) {
      return xmlResponse(emptySitemap());
    }

    const { seller, urls } = result.tenant;
    const content = await listTenantSitemapEntries(seller.id, seller.slug);

    const entries: SitemapEntry[] = [
      { url: urls.base, changeFrequency: "weekly", priority: 1.0 },
      { url: `${urls.base}/about`, changeFrequency: "monthly", priority: 0.6 },
      { url: `${urls.base}/contact`, changeFrequency: "monthly", priority: 0.8 },
    ];

    if (content.products.length > 0) {
      entries.push({ url: `${urls.base}/products`, changeFrequency: "weekly", priority: 0.9 });
      for (const product of content.products) {
        entries.push({
          url: `${urls.base}/products/${product.slug}`,
          lastModified: product.updatedAt,
          changeFrequency: "monthly",
          priority: 0.8,
        });
      }
    }

    if (content.services.length > 0) {
      entries.push({ url: `${urls.base}/services`, changeFrequency: "weekly", priority: 0.9 });
      for (const service of content.services) {
        entries.push({
          url: `${urls.base}/services/${service.slug}`,
          lastModified: service.updatedAt,
          changeFrequency: "monthly",
          priority: 0.8,
        });
      }
    }

    // An empty gallery page is thin content and is `noindex`, so it is only
    // listed when it actually has images.
    if (content.galleryCount > 0) {
      entries.push({ url: `${urls.base}/gallery`, changeFrequency: "monthly", priority: 0.5 });
    }

    return xmlResponse(renderSitemap(entries));
  }

  // ── Apex sitemap index ──
  const [sellerCount, productCount] = await Promise.all([
    countIndexableSellers(),
    countIndexableProducts(),
  ]);

  const sitemaps: Array<{ url: string }> = [
    { url: marketplaceUrl("/sitemap/core.xml") },
    { url: marketplaceUrl("/sitemap/categories.xml") },
    { url: marketplaceUrl("/sitemap/locations.xml") },
  ];

  // Shard by page size. At 10k sellers this is one or two files; the sharding
  // exists now because retrofitting it once the index is live means changing
  // URLs that Search Console has already registered.
  for (let i = 0; i * SITEMAP_PAGE_SIZE < Math.max(sellerCount, 1); i++) {
    sitemaps.push({ url: marketplaceUrl(`/sitemap/sellers-${i}.xml`) });
  }
  for (let i = 0; i * SITEMAP_PAGE_SIZE < Math.max(productCount, 1); i++) {
    sitemaps.push({ url: marketplaceUrl(`/sitemap/products-${i}.xml`) });
  }

  return xmlResponse(renderSitemapIndex(sitemaps));
}
