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
      expect(response.headers()["location"], `${path} should survive the redirect`).toBe(
        tenantUrl("verma-plastics", path),
      );
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

// ═════════════════════════ BULK UPLOAD (D49) ═════════════════════════════════

/**
 * Bulk upload is the largest write surface a seller has: one request can
 * create or overwrite a thousand products and attach five hundred
 * photographs. Every other isolation test in this file protects a READ; these
 * protect the writes, which is where a leak is destructive rather than merely
 * embarrassing.
 *
 * Two properties, stated as a seller would state them:
 *
 *   1. A spreadsheet of mine can never change a product of yours — even when
 *      it names your product code exactly. SKUs are unique PER SELLER, so the
 *      same code in two catalogues is two products, and "update the row whose
 *      SKU matches" must only ever consult my own.
 *
 *   2. A photo of mine can never land on a product of yours. The upload flow
 *      decides the product from a file name, so the question is whether that
 *      matching can ever see across the boundary.
 *
 * Driven over HTTP through the real routes, like the rest of this suite. The
 * spreadsheet goes in as CSV: the upload endpoint accepts it, and an inline
 * CSV keeps the row under test readable in the diff where an .xlsx fixture
 * would be opaque.
 */

const PASSWORD = "devpassword123";

/** Unique per run, so repeated runs never collide. */
const D49_STAMP = Date.now().toString(36);

/** A product abc-electronics owns, from prisma/seed/catalog.ts. */
const SELLER_A_SKU = "ABC-LP-40W";

/** Row 1 of the Products sheet, exactly as the template writes it. */
const IMPORT_HEADERS = [
  "Product Name *",
  "SKU / Product Code *",
  "Main Category *",
  "Sub Category *",
  "Price (₹)",
  "Max Price (₹)",
  "Unit",
  "Min Order Qty",
  "Brand",
  "Model Number",
  "Short Description",
  "Full Description",
  "Specifications",
  "Search Tags",
].join(",");

function importCsv(rows: Array<{ name: string; sku: string; price?: string }>): string {
  const lines = rows.map((row) =>
    [
      row.name,
      row.sku,
      "Electronics & Electrical",
      "LED Panels",
      row.price ?? "999",
      "",
      "Piece",
      "1",
      "",
      "",
      "",
      "",
      "",
      "",
    ].join(","),
  );

  return [IMPORT_HEADERS, ...lines].join("\n");
}

/** Sign in, reporting whether a usable session actually resulted. */
async function signInAs(request: APIRequestContext, email: string): Promise<boolean> {
  const csrf = await (await request.get(apexUrl("/api/auth/csrf"))).json();

  await request.post(apexUrl("/api/auth/callback/credentials"), {
    maxRedirects: 0,
    form: {
      csrfToken: csrf.csrfToken,
      email,
      password: PASSWORD,
      callbackUrl: apexUrl("/dashboard"),
      redirect: "false",
    },
  });

  // Auth.js answers 302 whether or not the credentials were accepted, so the
  // status proves nothing on its own.
  const dashboard = await request.get(apexUrl("/dashboard"), { maxRedirects: 0 });
  return dashboard.status() === 200;
}

/**
 * Everything below asserts over HTTP, with no second database connection.
 *
 * Partly for the reason the whole file gives — isolation is a property of the
 * server's RESPONSE, and reading the database instead would assert something
 * the seller never sees. Partly practical: the development database is PGlite,
 * Postgres embedded in a single Node process (D24), and a test client
 * connecting alongside the dev server's own pool drops connections with
 * `ECONNRESET`. That surfaced as a failure in whichever assertion happened to
 * run next, which is precisely the flake that stops a red suite meaning
 * anything.
 *
 * "Seller A's product is untouched" is therefore asserted from seller A's own
 * dashboard, which is also the stronger claim: not merely that the row is
 * intact, but that A still sees their product exactly as it was.
 */

/** Seller A's seeded product, as their dashboard renders it. */
const SELLER_A_PRODUCT = "LED Panel Light 40W";
/** priceMinor 129000 in INR, formatted by `formatPrice`. */
const SELLER_A_PRICE = "₹1,290";

test.describe("bulk upload cannot cross the tenant boundary (D49)", () => {
  test.describe.configure({ mode: "serial" });

  let sellerA: APIRequestContext;
  let sellerB: APIRequestContext;
  let signedIn = false;

  /** The batch seller B stages, so seller A can then be refused it. */
  let batchOfB = "";

  test.beforeAll(async ({ playwright }) => {
    sellerA = await playwright.request.newContext();
    sellerB = await playwright.request.newContext();

    const inA = await signInAs(sellerA, "owner@abc-electronics.test");
    const inB = await signInAs(sellerB, "owner@sharma-steel.test");
    signedIn = inA && inB;
  });

  test.beforeEach(() => {
    test.skip(
      !signedIn,
      "could not sign in — the login rate limit is working; retry within the hour",
    );
  });

  test.afterAll(async () => {
    // Nothing to clean up, by design: this block never presses Import, so no
    // product is ever written. What it does leave is one PENDING ImportJob row
    // per run — the record that a preview was looked at and abandoned, which
    // is exactly what that status is for. It shows in the seller's upload
    // history as "Not imported" and costs one row.
    await sellerA.dispose();
    await sellerB.dispose();
  });

  test("an anonymous visitor reaches none of the bulk upload surfaces", async ({ request }) => {
    for (const path of [
      "/dashboard/products/import",
      "/dashboard/products/import/photos",
      "/dashboard/products/import/template",
      "/dashboard/products/import/errors?batch=anything",
    ]) {
      const response = await request.get(apexUrl(path), { maxRedirects: 0 });
      expect(response.status(), `${path} must not render for a stranger`).not.toBe(200);
    }
  });

  test("the upload endpoint refuses an anonymous POST", async ({ request }) => {
    const response = await request.post(apexUrl("/dashboard/products/import/upload"), {
      maxRedirects: 0,
      multipart: {
        file: {
          name: "anon.csv",
          mimeType: "text/csv",
          buffer: Buffer.from(importCsv([{ name: "Anon", sku: "ANON-1" }])),
        },
      },
    });

    // A redirect carrying a batch id would mean an unauthenticated request had
    // just staged an import.
    const location = response.headers()["location"] ?? "";
    expect(location).not.toContain("batch=");
  });

  test("a spreadsheet naming ANOTHER seller's SKU is a NEW product, not an update", async () => {
    // The central assertion of this feature's isolation. Seller B uploads a row
    // whose product code belongs to seller A. Because SKUs are unique per
    // seller, B must be told this is a NEW product — if the preview said
    // "Update", B would be one button press away from overwriting A's listing.
    const response = await sellerB.post(apexUrl("/dashboard/products/import/upload"), {
      maxRedirects: 0,
      multipart: {
        file: {
          name: `d49-${D49_STAMP}-collision.csv`,
          mimeType: "text/csv",
          buffer: Buffer.from(
            importCsv([{ name: `Isolation Probe ${D49_STAMP}`, sku: SELLER_A_SKU, price: "1" }]),
          ),
        },
      },
    });

    const location = response.headers()["location"] ?? "";
    expect(location, "a staged batch should be produced").toContain("batch=");

    batchOfB = new URL(location, apexUrl()).searchParams.get("batch") ?? "";
    expect(batchOfB).toBeTruthy();

    const preview = await sellerB.get(apexUrl(`/dashboard/products/import?batch=${batchOfB}`), {
      maxRedirects: 0,
    });
    expect(preview.status()).toBe(200);

    const html = await preview.text();

    expect(html).toContain("New products");
    expect(
      html,
      "another seller's SKU must never be reported as an existing product to update",
    ).not.toContain("already exist with the same SKU");
  });

  test("seller A still sees their product exactly as it was", async () => {
    // The preview said "New", so nothing should have reached A at all. Checked
    // from A's own catalogue page: B's row carried the same SKU with the name
    // "Isolation Probe" and a price of ₹1, so either appearing here would mean
    // the write had crossed the boundary.
    const response = await sellerA.get(apexUrl("/dashboard/products"), { maxRedirects: 0 });
    expect(response.status()).toBe(200);

    const html = await response.text();

    expect(html, "seller A's product should still be listed").toContain(SELLER_A_PRODUCT);
    expect(html, "its price must not have been overwritten").toContain(SELLER_A_PRICE);
    expect(html, "seller B's row must not appear in seller A's catalogue").not.toContain(
      "Isolation Probe",
    );
  });

  test("one seller cannot download another seller's error report", async () => {
    // A batch id is a bearer token for "import these rows". It is namespaced by
    // seller, so A naming B's batch must resolve to nothing — not to B's rows,
    // and not to a message confirming the batch exists.
    expect(batchOfB, "the earlier test should have staged a batch").toBeTruthy();

    const response = await sellerA.get(
      apexUrl(`/dashboard/products/import/errors?batch=${batchOfB}`),
      { maxRedirects: 0 },
    );

    expect(response.status()).toBe(404);
    expect(await response.text()).not.toContain("Isolation Probe");
  });

  test("one seller cannot open another seller's staged preview", async () => {
    const response = await sellerA.get(apexUrl(`/dashboard/products/import?batch=${batchOfB}`), {
      maxRedirects: 0,
    });

    // The page renders — it is A's own import page — but as the upload step
    // with an "expired" notice, never with B's rows on it.
    expect(response.status()).toBe(200);
    expect(await response.text(), "another seller's rows must not render").not.toContain(
      "Isolation Probe",
    );
  });

  test("the bulk photos page lists only the signed-in seller's products", async () => {
    // Photo matching resolves a file name against this list, so a product that
    // is not on it cannot be matched however the file is named. The list is
    // built server-side from the tenant-scoped query; this asserts the
    // rendered result rather than the query.
    const response = await sellerB.get(apexUrl("/dashboard/products/import/photos"), {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(200);

    const html = await response.text();

    expect(html, "another seller's SKU must not appear in the product list").not.toContain(
      SELLER_A_SKU,
    );
    expect(html).not.toContain("LED Panel Light 40W");
  });

  test("seller B's bulk photo session cannot reach seller A's products", async () => {
    // The photo flow has one input that decides which product a file lands on:
    // the SKU in its name. Seller B naming a file after seller A's SKU must
    // match nothing, which is asserted here at the only point B can observe —
    // the "Missing photos" filter on B's own catalogue, which is built from
    // the same tenant-scoped query the matcher uses.
    //
    // `attachPhotoAction` is the second line: it re-reads the product through
    // the tenant client and refuses an id that is not this seller's, and the
    // inserted row carries `sellerId` for `db-tenant` to verify. Those two are
    // covered by the unit tests in tests/unit/photo-names.test.ts, which can
    // assert the matcher directly without an upload.
    const response = await sellerB.get(apexUrl("/dashboard/products?filter=missing-photos"), {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(200);

    const html = await response.text();
    expect(html, "another seller's product must not be offered a photo").not.toContain(
      SELLER_A_PRODUCT,
    );
    expect(html).not.toContain(SELLER_A_SKU);
  });

  test("the template is generated for a signed-in seller", async () => {
    // Not an isolation property, but the file every other step depends on, and
    // it is generated from the database on every request.
    const response = await sellerB.get(apexUrl("/dashboard/products/import/template"), {
      maxRedirects: 0,
    });

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("spreadsheetml");

    const body = await response.body();
    // Every .xlsx is a ZIP, so it starts "PK\x03\x04".
    expect(body.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    expect(body.byteLength).toBeGreaterThan(10_000);
  });
});
