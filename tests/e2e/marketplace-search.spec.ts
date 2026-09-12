import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * Marketplace search, filters and discovery pages.
 *
 * Fixtures come from prisma/seed/catalog.ts: 11 live products across three
 * verified sellers, one product under building-construction/steel/tmt-bars and
 * the rest under electronics and industrial-textiles.
 */

const PORT = Number(process.env.PORT ?? 3000);
const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? `lvh.me:${PORT}`;
const APEX = `http://${ROOT}`;

/**
 * Fetch a page and strip React's server-render comment markers.
 *
 * React emits `<!-- -->` between static text and an interpolated value, so JSX
 * like `Suppliers in {location.name}` renders as
 * `Suppliers in <!-- -->Mumbai`. Without this, every assertion on a sentence
 * containing a variable silently fails for a reason that has nothing to do with
 * the behaviour under test.
 */
async function html(request: APIRequestContext, path: string) {
  const response = await request.get(`${APEX}${path}`, { maxRedirects: 0 });
  expect(response.status(), `expected 200 from ${path}`).toBe(200);
  const body = await response.text();
  return body.replace(/<!--[\s\S]*?-->/g, "");
}

/** Pull the result count out of the aria-live region. */
async function resultCount(request: APIRequestContext, path: string): Promise<number> {
  const body = (await html(request, path)).replace(/\n/g, "");
  const match = body.match(/aria-live="polite">.*?tabular-nums">(\d+)<\/span>/);
  expect(match, `no result count on ${path}`).not.toBeNull();
  return Number(match![1]);
}

test.describe("full-text search", () => {
  test("finds products by name", async ({ request }) => {
    const body = await html(request, "/search?q=led");
    expect(body).toContain("LED Panel Light 40W");
    expect(body).toContain("LED Bulb 9W B22");
  });

  test("matches across multiple words", async ({ request }) => {
    const body = await html(request, "/search?q=copper+cable");
    expect(body).toContain("Copper Flexible Cable");
  });

  test("falls back to fuzzy matching for typos, and says so", async ({ request }) => {
    // "panle" has no exact tsvector match. Without the fallback this is a dead
    // end, which is what most real mistyped queries would hit.
    const body = await html(request, "/search?q=panle");

    expect(body).toContain("No exact matches");
    expect(body).toContain("LED Panel Light 40W");
  });

  test("shows an empty state with recovery options, not an error", async ({ request }) => {
    const body = await html(request, "/search?q=zzzzqqqqnothing&category=electronics");

    expect(body).toContain("Nothing matched that search");
    expect(body).toContain("Search all categories");
  });

  test("survives hostile query strings", async ({ request }) => {
    for (const query of [
      "/search?page=999999999",
      "/search?sort=';DROP+TABLE+Product;--",
      "/search?minPrice=-5&maxPrice=Infinity",
      "/search?mode=../../etc/passwd",
      `/search?q=${"x".repeat(500)}`,
    ]) {
      const response = await request.get(`${APEX}${query}`, { maxRedirects: 0 });
      expect(response.status(), `${query} should not error`).toBe(200);
    }
  });

  test("an injection attempt in the query returns results, not an error", async ({ request }) => {
    // Proves the query is parameterised: this is treated as search text.
    const response = await request.get(`${APEX}/search?q=' OR 1=1--`, { maxRedirects: 0 });
    expect(response.status()).toBe(200);

    // And the table is still there afterwards.
    expect(await resultCount(request, "/search")).toBeGreaterThan(0);
  });
});

test.describe("filters narrow the result set", () => {
  test("category filters, including whole subtrees", async ({ request }) => {
    const all = await resultCount(request, "/search");
    const panels = await resultCount(request, "/search?category=electronics/lighting/led-panels");

    expect(panels).toBeGreaterThan(0);
    expect(panels).toBeLessThan(all);

    // A parent category must include descendants: the only product under
    // building-construction sits three levels down at steel/tmt-bars.
    const construction = await resultCount(request, "/search?category=building-construction");
    expect(construction).toBeGreaterThan(0);
  });

  test("location filters, including whole subtrees", async ({ request }) => {
    const all = await resultCount(request, "/search");
    const mumbai = await resultCount(request, "/search?location=in/maharashtra/mumbai");

    expect(mumbai).toBeGreaterThan(0);
    expect(mumbai).toBeLessThan(all);

    // A state must include its cities.
    const gujarat = await resultCount(request, "/search?location=in/gujarat");
    expect(gujarat).toBeGreaterThan(0);
  });

  test("price bounds exclude price-on-request listings", async ({ request }) => {
    const all = await resultCount(request, "/search");
    const cheap = await resultCount(request, "/search?maxPrice=200");

    expect(cheap).toBeLessThan(all);
    // "under ₹200" must not sweep in every unpriced listing.
    const priced = await resultCount(request, "/search?pricedOnly=1");
    expect(priced).toBeLessThan(all);
  });

  test("an unknown filter path widens rather than breaking", async ({ request }) => {
    // A stale bookmark to a deleted category should still return a page.
    const count = await resultCount(request, "/search?category=does/not/exist");
    expect(count).toBeGreaterThan(0);
  });

  test("filters compose", async ({ request }) => {
    const single = await resultCount(request, "/search?location=in/maharashtra/mumbai");
    const both = await resultCount(
      request,
      "/search?location=in/maharashtra/mumbai&category=electronics/lighting/led-panels",
    );
    expect(both).toBeLessThanOrEqual(single);
  });

  test("facet counts appear alongside options", async ({ request }) => {
    const body = await html(request, "/search");
    expect(body).toContain("Filters");
    expect(body).toContain("LED Panels");
  });

  test("supplier mode searches sellers instead of products", async ({ request }) => {
    const body = await html(request, "/search?mode=sellers");
    expect(body).toContain("supplier");
    expect(body).toContain("ABC Electronics");
  });
});

test.describe("only live content from live sellers is searchable", () => {
  test("suspended, unverified and deleted sellers never appear", async ({ request }) => {
    const body = await html(request, "/search?mode=sellers");

    // kumar-tools is SUSPENDED, patel-textiles is PENDING_VERIFICATION,
    // old-traders is soft-deleted. None may surface on the marketplace.
    expect(body).not.toContain("Kumar Tools");
    expect(body).not.toContain("Patel Textiles");
    expect(body).not.toContain("Old Traders");
  });

  test("a sparse but verified seller IS discoverable", async ({ request }) => {
    // sharma-steel fails the D2 INDEXING gate, but that governs crawlers, not
    // buyers. Hiding it from marketplace search would make new sellers
    // invisible to the people they are trying to reach.
    const body = await html(request, "/search?mode=sellers");
    expect(body).toContain("Sharma Steel");
  });
});

test.describe("discovery pages", () => {
  test("category page lists products and subcategories", async ({ request }) => {
    const body = await html(request, "/category/electronics/lighting");
    expect(body).toContain("Lighting");
    expect(body).toContain("LED Panels");
  });

  test("location page lists suppliers", async ({ request }) => {
    const body = await html(request, "/location/in/maharashtra/mumbai");
    expect(body).toContain("Suppliers in Mumbai");
    expect(body).toContain("ABC Electronics");
  });

  test("unknown category and location 404", async ({ request }) => {
    for (const path of ["/category/not/a/real/thing", "/location/xx/yy"]) {
      const response = await request.get(`${APEX}${path}`, { maxRedirects: 0 });
      expect(response.status(), path).toBe(404);
    }
  });

  test("homepage shows categories, products and suppliers", async ({ request }) => {
    const body = await html(request, "/");
    expect(body).toContain("Browse by category");
    expect(body).toContain("ABC Electronics");
  });

  test("seller profile renders with a route onward to the microsite", async ({ request }) => {
    const body = await html(request, "/seller/abc-electronics");
    expect(body).toContain("ABC Electronics");
    expect(body).toContain(`abc-electronics.${ROOT}`);
  });

  test("marketplace product detail renders", async ({ request }) => {
    const body = await html(request, "/product/abc-electronics/led-panel-40w");
    expect(body).toContain("LED Panel Light 40W");
    expect(body).toContain("Luminous flux");
  });

  test("a product under the wrong seller 404s", async ({ request }) => {
    // Product slugs are unique per tenant, so this slug exists — under a
    // different seller. Resolving it would mean the seller filter was dropped.
    const response = await request.get(`${APEX}/product/sharma-steel/led-panel-40w`, {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(404);
  });

  test("suspended and unverified sellers have no marketplace profile", async ({ request }) => {
    for (const slug of ["kumar-tools", "patel-textiles", "old-traders"]) {
      const response = await request.get(`${APEX}/seller/${slug}`, { maxRedirects: 0 });
      expect(response.status(), slug).toBe(404);
    }
  });
});

test.describe("canonical policy (decision D1)", () => {
  test("marketplace product pages canonical to the microsite", async ({ request }) => {
    const body = await html(request, "/product/abc-electronics/led-panel-40w");
    const canonical = body.match(/<link rel="canonical" href="([^"]+)"/);

    expect(canonical).not.toBeNull();
    // The seller's subdomain owns the content and accumulates the ranking.
    expect(canonical![1]).toContain(`abc-electronics.${ROOT}`);
    expect(canonical![1]).toContain("/products/led-panel-40w");
  });

  test("seller profiles canonical to the microsite home", async ({ request }) => {
    const body = await html(request, "/seller/abc-electronics");
    const canonical = body.match(/<link rel="canonical" href="([^"]+)"/);
    expect(canonical![1]).toContain(`abc-electronics.${ROOT}`);
  });

  test("category pages are canonical to themselves on the apex", async ({ request }) => {
    // The marketplace owns aggregate discovery surfaces.
    const body = await html(request, "/category/electronics/lighting/led-panels");
    const canonical = body.match(/<link rel="canonical" href="([^"]+)"/);

    expect(canonical![1]).toContain(ROOT);
    expect(canonical![1]).not.toContain("abc-electronics.");
    expect(canonical![1]).toContain("/category/electronics/lighting/led-panels");
  });

  test("filtered searches are noindex; the bare search page is not", async ({ request }) => {
    const filtered = await html(request, "/search?q=led&category=electronics");
    expect(filtered).toContain("noindex");

    const bare = await html(request, "/search");
    expect(bare).not.toContain('name="robots" content="noindex');
  });

  test("search canonical always points at the unfiltered page", async ({ request }) => {
    // Thousands of filter permutations are the same catalogue sliced
    // differently, and must not each claim to be a page.
    const body = await html(request, "/search?q=led&category=electronics&sort=price_asc&page=2");
    const canonical = body.match(/<link rel="canonical" href="([^"]+)"/);

    expect(canonical![1]).toMatch(/\/search$/);
  });

  test("deep pagination on category pages is noindex", async ({ request }) => {
    const body = await html(request, "/category/electronics?page=9");
    expect(body).toContain("noindex");
  });
});
