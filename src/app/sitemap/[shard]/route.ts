import { notFound } from "next/navigation";
import {
  listIndexableProducts,
  listIndexableSellers,
  listIndexableServices,
  listSitemapCategories,
  listSitemapLocations,
  SITEMAP_PAGE_SIZE,
} from "@/server/services/sitemap.service";
import { renderSitemap, xmlResponse, type SitemapEntry } from "@/lib/seo/sitemap";
import { marketplaceUrl, tenantUrl } from "@/lib/utils/url";

/**
 * Sharded apex sitemaps, referenced by the index at /sitemap.xml.
 *
 * ── Where these URLs point (decision D1) ─────────────────────────────────────
 * Seller and product entries point at the MICROSITE, not the marketplace copy.
 * The microsite is canonical for that content, and a sitemap should only ever
 * advertise canonical URLs — listing the marketplace version would ask crawlers
 * to index a page that immediately points elsewhere.
 *
 * Category and location pages point at the apex, which is canonical for
 * aggregate discovery.
 */

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ shard: string }> };

/** `sellers-3.xml` → { kind: "sellers", index: 3 } */
function parseShard(shard: string): { kind: string; index: number } | null {
  const name = shard.replace(/\.xml$/, "");
  const match = name.match(/^([a-z]+)(?:-(\d+))?$/);
  if (!match) return null;

  const index = match[2] ? Number.parseInt(match[2], 10) : 0;
  // Guard the offset: an unbounded shard number becomes an unbounded OFFSET.
  if (!Number.isFinite(index) || index < 0 || index > 1000) return null;

  return { kind: match[1]!, index };
}

export async function GET(_request: Request, { params }: Props) {
  const { shard } = await params;
  const parsed = parseShard(shard);

  if (!parsed) notFound();

  const offset = parsed.index * SITEMAP_PAGE_SIZE;

  switch (parsed.kind) {
    case "core":
      return xmlResponse(
        renderSitemap([
          { url: marketplaceUrl("/"), changeFrequency: "daily", priority: 1.0 },
          { url: marketplaceUrl("/search"), changeFrequency: "weekly", priority: 0.7 },
          { url: marketplaceUrl("/sellers"), changeFrequency: "daily", priority: 0.8 },
          { url: marketplaceUrl("/products"), changeFrequency: "daily", priority: 0.8 },
          { url: marketplaceUrl("/register"), changeFrequency: "monthly", priority: 0.5 },
        ]),
      );

    case "categories": {
      const categories = await listSitemapCategories();
      return xmlResponse(
        renderSitemap(
          categories.map((category) => ({
            url: marketplaceUrl(`/category${category.path}`),
            changeFrequency: "daily" as const,
            priority: 0.8,
          })),
        ),
      );
    }

    case "locations": {
      const locations = await listSitemapLocations();
      return xmlResponse(
        renderSitemap(
          locations.map((location) => ({
            url: marketplaceUrl(`/location${location.path}`),
            changeFrequency: "weekly" as const,
            priority: 0.7,
          })),
        ),
      );
    }

    case "sellers": {
      const sellers = await listIndexableSellers(offset);
      return xmlResponse(
        renderSitemap(
          sellers.map((seller) => ({
            // Canonical location: the seller's own subdomain.
            url: tenantUrl(seller.slug),
            lastModified: seller.updatedAt,
            changeFrequency: "weekly" as const,
            priority: 0.9,
          })),
        ),
      );
    }

    case "products": {
      const [products, services] = await Promise.all([
        listIndexableProducts(offset),
        parsed.index === 0 ? listIndexableServices(0) : Promise.resolve([]),
      ]);

      const entries: SitemapEntry[] = products.map((product) => ({
        url: tenantUrl(product.seller.slug, `/products/${product.slug}`),
        lastModified: product.updatedAt,
        changeFrequency: "monthly" as const,
        priority: 0.8,
      }));

      // Services ride along in the first shard: there are far fewer of them
      // than products, and a separate near-empty sitemap file is noise in the
      // index.
      for (const service of services) {
        entries.push({
          url: tenantUrl(service.seller.slug, `/services/${service.slug}`),
          lastModified: service.updatedAt,
          changeFrequency: "monthly",
          priority: 0.8,
        });
      }

      return xmlResponse(renderSitemap(entries));
    }

    default:
      notFound();
  }
}
