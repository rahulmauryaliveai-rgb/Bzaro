/**
 * Sitemap XML generation.
 *
 * Hand-built rather than using the `sitemap.ts` metadata convention, for one
 * decisive reason: these responses must vary by HOST. One handler serves the
 * apex index and every tenant's own sitemap, and the metadata convention has no
 * access to the request host.
 *
 * Every URL is XML-escaped. Slugs are constrained by the CHECK constraint so
 * they cannot contain markup today, but a sitemap is a machine-readable
 * contract — one unescaped `&` in a query string makes the whole document
 * unparseable, and Search Console reports it as a fetch error rather than
 * anything that points at the cause.
 */

export type SitemapEntry = {
  url: string;
  /**
   * Accepts a string as well as a Date, deliberately.
   *
   * `unstable_cache` round-trips its return value through JSON, so a `Date`
   * loaded from a cached query arrives here as an ISO STRING even though the
   * Prisma types say `Date`. Typing this as `Date` alone compiles cleanly and
   * then throws `toISOString is not a function` on the first cache hit — which
   * looks like an empty 500 and gives no hint about the cause.
   */
  lastModified?: Date | string | null;
  changeFrequency?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number;
};

/** Normalise a date that may have crossed a JSON cache boundary. */
function toIsoDate(value: Date | string): string | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

/** Escape the five XML predefined entities. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function renderSitemap(entries: SitemapEntry[]): string {
  const urls = entries
    .map((entry) => {
      const parts = [`    <loc>${escapeXml(entry.url)}</loc>`];

      if (entry.lastModified) {
        // W3C datetime. Date-only is valid and avoids implying a precision we
        // do not have.
        const lastmod = toIsoDate(entry.lastModified);
        if (lastmod) parts.push(`    <lastmod>${lastmod}</lastmod>`);
      }
      if (entry.changeFrequency) {
        parts.push(`    <changefreq>${entry.changeFrequency}</changefreq>`);
      }
      if (entry.priority !== undefined) {
        parts.push(`    <priority>${entry.priority.toFixed(1)}</priority>`);
      }

      return `  <url>\n${parts.join("\n")}\n  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

export function renderSitemapIndex(
  sitemaps: Array<{ url: string; lastModified?: Date | string }>,
): string {
  const entries = sitemaps
    .map((sitemap) => {
      const iso = sitemap.lastModified ? toIsoDate(sitemap.lastModified) : null;
      const lastmod = iso ? `\n    <lastmod>${iso}</lastmod>` : "";
      return `  <sitemap>\n    <loc>${escapeXml(sitemap.url)}</loc>${lastmod}\n  </sitemap>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</sitemapindex>`;
}

export function xmlResponse(body: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // Cached at the edge for an hour; crawlers re-fetch far more often than
      // the content changes, and every fetch is a function invocation.
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

/** An empty but valid sitemap — for hosts with nothing indexable to offer. */
export function emptySitemap(): string {
  return renderSitemap([]);
}
