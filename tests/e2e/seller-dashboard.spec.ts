import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * Seller onboarding and dashboard.
 *
 * These are authenticated surfaces, so the HTTP-level assertions here are about
 * being LOCKED OUT and about the routing that gets an unauthenticated visitor
 * to the right place. The form behaviour itself is covered by the unit tests on
 * the validation schemas.
 *
 * A signed-in journey test needs a real session cookie, which needs the login
 * POST flow — that is browser-driven work, and Playwright's chromium download
 * is blocked on this network. Noted rather than silently skipped.
 */

const PORT = Number(process.env.PORT ?? 3000);
const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? `lvh.me:${PORT}`;
const APEX = `http://${ROOT}`;

async function get(request: APIRequestContext, path: string) {
  return request.get(`${APEX}${path}`, { maxRedirects: 0 });
}

test.describe("dashboard requires a session", () => {
  for (const path of [
    "/dashboard",
    "/dashboard/profile",
    "/dashboard/website",
    "/dashboard/settings",
    "/dashboard/enquiries",
  ]) {
    test(`${path} does not render for an anonymous visitor`, async ({ request }) => {
      const response = await get(request, path);
      expect(response.status(), `${path} must not render`).not.toBe(200);
    });
  }

  test("every dashboard page is noindex and uncacheable", async ({ request }) => {
    const response = await get(request, "/dashboard/profile");

    expect(response.headers()["x-robots-tag"]).toContain("noindex");
    // A shared cache holding one seller's dashboard is a cross-tenant leak.
    expect(response.headers()["cache-control"]).toContain("no-store");
  });
});

test.describe("business onboarding", () => {
  test("requires a session", async ({ request }) => {
    const response = await get(request, "/register/business");
    expect(response.status()).not.toBe(200);
  });

  test("redirects an anonymous visitor to login, carrying the destination", async ({ request }) => {
    const response = await get(request, "/register/business");
    const location = response.headers()["location"] ?? "";

    // A guard that redirects somewhere the user cannot come back from is worse
    // than no guard.
    if (response.status() >= 300 && response.status() < 400) {
      expect(location).toContain("/login");
    }
  });

  test("is never served as an indexable page", async ({ request }) => {
    const response = await get(request, "/register/business");

    // Anonymous visitors get a 307 to the login page, so there is no content
    // for a crawler to index. The earlier version of this test asserted an
    // `x-robots-tag` on the redirect — but a redirect carries no page to
    // index, and the header is only configured for /dashboard and /admin.
    //
    // The property that actually matters is that this route never returns a
    // renderable 200 to an anonymous request; when it does render, for a
    // signed-in user, its own metadata sets noindex.
    expect(response.status()).toBe(307);

    const destination = response.headers()["location"] ?? "";
    expect(destination).toContain("/login");

    // And the page it lands on is itself noindex.
    const login = await request.get(`${APEX}${destination}`, { maxRedirects: 0 });
    expect(await login.text()).toContain("noindex");
  });
});

test.describe("the onboarding entry point exists", () => {
  test("registration is reachable and indexable", async ({ request }) => {
    // This is the top of the seller funnel and should rank.
    const response = await get(request, "/register");
    expect(response.status()).toBe(200);

    const body = await response.text();
    expect(body).not.toContain('name="robots" content="noindex');
  });

  test("the marketplace links to it", async ({ request }) => {
    const response = await get(request, "/");
    const body = await response.text();
    expect(body).toContain('href="/register"');
  });
});

test.describe("slug rules are enforced before a seller can claim one", () => {
  // The availability endpoint is a Server Action and needs a session, so these
  // assert the public consequence instead: reserved and malformed subdomains
  // never resolve to a tenant, whatever a form might have accepted.
  test("reserved subdomains do not resolve as tenants", async ({ request }) => {
    for (const label of ["www", "api", "admin"]) {
      const response = await request.get(`http://${label}.${ROOT}/`, { maxRedirects: 0 });
      const body = response.status() === 200 ? await response.text() : "";

      // Falls through to the marketplace, never a seller microsite.
      if (body) expect(body).not.toContain("Powered by");
    }
  });

  test("a multi-label host never resolves to a tenant", async ({ request }) => {
    // A wildcard certificate covers exactly one label, so `a.b.host` has no
    // valid certificate and must not be a tenant even if a slug slipped through.
    const response = await request.get(`http://a.b.${ROOT}/`, { maxRedirects: 0 });
    const body = response.status() === 200 ? await response.text() : "";
    if (body) expect(body).not.toContain("Powered by");
  });
});
