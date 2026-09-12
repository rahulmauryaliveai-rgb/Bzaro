import { describe, expect, it } from "vitest";
import { renderSitemap, renderSitemapIndex } from "@/lib/seo/sitemap";

/**
 * Sitemap rendering.
 *
 * A sitemap is a machine-readable contract. One unescaped `&` makes the whole
 * document unparseable, and Search Console reports it as a generic fetch error
 * that points nowhere near the cause.
 */

describe("renderSitemap", () => {
  it("renders a valid document", () => {
    const xml = renderSitemap([{ url: "https://abc.example.com/" }]);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("http://www.sitemaps.org/schemas/sitemap/0.9");
    expect(xml).toContain("<loc>https://abc.example.com/</loc>");
  });

  it("escapes ampersands in URLs", () => {
    const xml = renderSitemap([{ url: "https://x.test/a?b=1&c=2" }]);

    expect(xml).toContain("&amp;");
    // A bare & would make the document invalid XML.
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/);
  });

  it("escapes angle brackets", () => {
    const xml = renderSitemap([{ url: "https://x.test/<script>" }]);
    expect(xml).not.toContain("<script>");
    expect(xml).toContain("&lt;");
  });

  it("accepts a Date for lastModified", () => {
    const xml = renderSitemap([
      { url: "https://x.test/", lastModified: new Date("2026-03-04T12:00:00Z") },
    ]);
    expect(xml).toContain("<lastmod>2026-03-04</lastmod>");
  });

  it("accepts an ISO STRING for lastModified", () => {
    // This is the case that matters: `unstable_cache` round-trips its return
    // value through JSON, so a Date loaded from a cached query arrives as a
    // string even though the Prisma types say Date. Typing this as Date alone
    // compiled cleanly and then threw on the first cache hit.
    const xml = renderSitemap([
      { url: "https://x.test/", lastModified: "2026-03-04T12:00:00.000Z" },
    ]);
    expect(xml).toContain("<lastmod>2026-03-04</lastmod>");
  });

  it("omits lastmod for an unparseable date rather than throwing", () => {
    const xml = renderSitemap([{ url: "https://x.test/", lastModified: "not a date" }]);
    expect(xml).not.toContain("<lastmod>");
    expect(xml).toContain("<loc>");
  });

  it("renders an empty but valid document for no entries", () => {
    // A non-indexable tenant serves this rather than a 404: a 404 on a URL
    // advertised in robots.txt is a crawl error.
    const xml = renderSitemap([]);
    expect(xml).toContain("<urlset");
    expect(xml).not.toContain("<url>");
  });

  it("includes changefreq and priority when given", () => {
    const xml = renderSitemap([
      { url: "https://x.test/", changeFrequency: "weekly", priority: 0.8 },
    ]);
    expect(xml).toContain("<changefreq>weekly</changefreq>");
    expect(xml).toContain("<priority>0.8</priority>");
  });
});

describe("renderSitemapIndex", () => {
  it("renders a sitemap index", () => {
    const xml = renderSitemapIndex([
      { url: "https://x.test/sitemap/core.xml" },
      { url: "https://x.test/sitemap/sellers-0.xml" },
    ]);

    expect(xml).toContain("<sitemapindex");
    expect(xml).toContain("<loc>https://x.test/sitemap/core.xml</loc>");
    expect(xml).not.toContain("<urlset");
  });

  it("accepts a string lastModified, like the sitemap renderer", () => {
    const xml = renderSitemapIndex([
      { url: "https://x.test/sitemap/core.xml", lastModified: "2026-03-04T00:00:00.000Z" },
    ]);
    expect(xml).toContain("<lastmod>2026-03-04</lastmod>");
  });
});
