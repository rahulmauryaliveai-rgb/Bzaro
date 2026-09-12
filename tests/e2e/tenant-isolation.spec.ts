import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * TENANT ISOLATION — the gate for every later phase.
 *
 * This suite must be green before any CRUD or marketplace feature is built, and
 * it must stay green afterwards. It is the executable form of the one promise
 * the architecture makes: tenant A can never receive tenant B's data.
 *
 * Any change to src/proxy.ts, src/lib/tenant/**, or src/lib/db-tenant.ts must
 * be validated against this file.
 *
 * Fixtures come from prisma/seed/sellers.ts, where each tenant exists to
 * exercise one branch of tenant resolution.
 */

const PORT = Number(process.env.PORT ?? 3000);
const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? `lvh.me:${PORT}`;

/** Build an absolute URL on a given tenant's hostname. */
function tenantUrl(slug: string, path = "/") {
  return `http://${slug}.${ROOT}${path}`;
}

function apexUrl(path = "/") {
  return `http://${ROOT}${path}`;
}

/** Fetch without following redirects, so 301s can be asserted directly. */
async function raw(request: APIRequestContext, url: string) {
  return request.get(url, { maxRedirects: 0 });
}

test.describe("hostname resolves to the correct tenant", () => {
  test("a populated tenant renders its own content", async ({ request }) => {
    const response = await raw(request, tenantUrl("abc-electronics"));
    expect(response.status()).toBe(200);

    const body = await response.text();
    expect(body).toContain("ABC Electronics");
  });

  test("a second tenant renders ITS own content, not the first's", async ({ request }) => {
    const response = await raw(request, tenantUrl("sharma-steel"));
    expect(response.status()).toBe(200);

    const body = await response.text();
    expect(body).toContain("Sharma Steel");

    // The core assertion of the entire architecture. If this ever fails, a
    // cached page has crossed a tenant boundary and the platform is leaking.
    expect(body).not.toContain("ABC Electronics");
  });

  test("tenants stay separate under concurrent load", async ({ request }) => {
    // Cache-key collisions surface under concurrency, not sequential requests:
    // two tenants racing for the same cache entry is exactly the bug that
    // encoding the tenant in the pathname exists to prevent.
    const requests = Array.from({ length: 12 }, (_, i) =>
      i % 2 === 0
        ? raw(request, tenantUrl("abc-electronics")).then(async (r) => ({
            slug: "abc-electronics",
            body: await r.text(),
          }))
        : raw(request, tenantUrl("verma-plastics")).then(async (r) => ({
            slug: "verma-plastics",
            body: await r.text(),
          })),
    );

    const results = await Promise.all(requests);

    for (const result of results) {
      if (result.slug === "abc-electronics") {
        expect(result.body).toContain("ABC Electronics");
        expect(result.body).not.toContain("Verma Plastics");
      } else {
        expect(result.body).toContain("Verma Plastics");
        expect(result.body).not.toContain("ABC Electronics");
      }
    }
  });
});

test.describe("tenant lifecycle states map to the right status", () => {
  test("an unverified seller is not public", async ({ request }) => {
    const response = await raw(request, tenantUrl("patel-textiles"));
    expect(response.status()).toBe(404);
  });

  test("a suspended seller returns 403 and does not leak content", async ({ request }) => {
    const response = await raw(request, tenantUrl("kumar-tools"));
    expect(response.status()).toBe(403);

    const body = await response.text();
    expect(body).toContain("unavailable");
    // A suspended site must not serve its catalogue or contact details.
    expect(body).not.toContain("Plot 14");
  });

  test("a soft-deleted seller is gone", async ({ request }) => {
    const response = await raw(request, tenantUrl("old-traders"));
    expect([404, 410]).toContain(response.status());
  });

  test("an unknown subdomain is a 404, not a crash", async ({ request }) => {
    const response = await raw(request, tenantUrl("does-not-exist-anywhere"));
    expect(response.status()).toBe(404);
  });

  test("a renamed slug redirects permanently to the current one", async ({ request }) => {
    // Link equity depends on old subdomains redirecting forever (decision D11).
    const response = await raw(request, tenantUrl("verma-plastic-industries"));
    expect(response.status()).toBe(308);

    const location = response.headers()["location"];
    expect(location).toContain("verma-plastics");
  });

  test("the rename redirect keeps the path, not just the host", async ({ request }) => {
    // Regression: every old URL used to collapse onto the new homepage, which
    // discards the ranking of every deep page the seller had — and Google
    // treats a redirect to an unrelated page as a soft 404, so the rename cost
    // precisely what the redirect exists to protect.
    for (const path of ["/about", "/products", "/contact"]) {
      const response = await raw(request, tenantUrl("verma-plastic-industries", path));

      expect(response.status(), `${path} should redirect`).toBe(308);
      expect(
        response.headers()["location"],
        `${path} should survive the redirect`,
      ).toBe(tenantUrl("verma-plastics", path));
    }
  });

  test("a client-supplied path header cannot redirect the visitor elsewhere", async ({
    request,
  }) => {
    // The proxy overwrites the header rather than appending, so a forged value
    // cannot turn a rename redirect into an open redirect.
    const response = await request.get(tenantUrl("verma-plastic-industries", "/about"), {
      maxRedirects: 0,
      headers: { "x-tenant-path": "https://evil.example.com/" },
    });

    expect(response.headers()["location"]).toBe(tenantUrl("verma-plastics", "/about"));
  });
});

test.describe("the tenant path space is not publicly reachable", () => {
  test("the internal /site/ segment 404s on the apex", async ({ request }) => {
    // Otherwise every microsite would be reachable a second time at
    // bzaro.in/site/<slug>, duplicating the whole catalogue and
    // undermining the canonical strategy (decision D1).
    const response = await raw(request, apexUrl("/site/abc-electronics"));
    expect(response.status()).toBe(404);
  });

  test("reserved subdomains do not resolve to tenants", async ({ request }) => {
    // `www` must serve the marketplace, never a seller who registered the slug.
    const response = await raw(request, `http://www.${ROOT}/`);
    expect(response.status()).toBe(200);

    const body = await response.text();

    // Assert on marketplace chrome rather than on the absence of a seller name.
    // The earlier version checked that "Sharma Steel" was missing, which stopped
    // meaning anything once the marketplace homepage started listing suppliers
    // — a seller name appearing here is now correct. What must stay true is that
    // this is the MARKETPLACE, not a tenant microsite.
    expect(body).toContain("Browse by category");
    expect(body).toContain("List your business");

    // Microsite chrome must be absent: a tenant site links to its own /about
    // and /gallery and carries the "powered by" footer.
    expect(body).not.toContain("Powered by");
  });
});

test.describe("indexing gate (decision D2)", () => {
  test("a complete tenant is indexable", async ({ request }) => {
    const response = await raw(request, tenantUrl("abc-electronics"));
    const body = await response.text();
    expect(body).not.toContain('name="robots" content="noindex');
  });

  test("a sparse tenant is noindex", async ({ request }) => {
    // sharma-steel fails the description and catalogue thresholds. If this ever
    // goes green-to-red, thousands of thin subdomains are being handed to
    // crawlers and the root domain is at risk.
    const response = await raw(request, tenantUrl("sharma-steel"));
    const body = await response.text();
    expect(body).toContain("noindex");
  });

  test("robots.txt disallows everything on a non-indexable tenant", async ({ request }) => {
    const response = await request.get(tenantUrl("sharma-steel", "/robots.txt"));
    expect(response.status()).toBe(200);

    const body = await response.text();
    expect(body).toContain("Disallow: /");
  });

  test("robots.txt allows crawling on an indexable tenant", async ({ request }) => {
    const response = await request.get(tenantUrl("abc-electronics", "/robots.txt"));
    const body = await response.text();
    expect(body).toContain("Allow: /");
    expect(body).toContain("Sitemap:");
  });

  test("the apex robots.txt keeps crawlers out of private surfaces", async ({ request }) => {
    const response = await request.get(apexUrl("/robots.txt"));
    const body = await response.text();
    expect(body).toContain("Disallow: /dashboard");
    expect(body).toContain("Disallow: /admin");
  });
});

test.describe("session cookies never reach a tenant host", () => {
  test("a tenant page sets no session cookie", async ({ request }) => {
    // Microsites are entirely anonymous. A session cookie appearing on a tenant
    // host would mean the auth cookie has been scoped to the parent domain,
    // exposing platform sessions to any XSS on any seller's site.
    const response = await raw(request, tenantUrl("abc-electronics"));
    const setCookie = response.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie");

    for (const header of setCookie) {
      expect(header.value.toLowerCase()).not.toContain("authjs.session-token");
    }
  });

  test("a tenant page renders identically whether or not a cookie is sent", async ({ request }) => {
    // Proves no session state leaks into cacheable tenant output.
    const anonymous = await raw(request, tenantUrl("abc-electronics"));
    const withCookie = await request.get(tenantUrl("abc-electronics"), {
      maxRedirects: 0,
      headers: { cookie: "authjs.session-token=not-a-real-token" },
    });

    expect(await anonymous.text()).toBe(await withCookie.text());
  });
});

test.describe("private surfaces are not indexable", () => {
  for (const path of ["/dashboard", "/admin"]) {
    test(`${path} sends noindex headers`, async ({ request }) => {
      const response = await raw(request, apexUrl(path));
      const robots = response.headers()["x-robots-tag"];
      expect(robots).toContain("noindex");

      const cache = response.headers()["cache-control"];
      // A shared cache holding one seller's dashboard is a cross-tenant leak.
      expect(cache).toContain("no-store");
    });
  }
});
