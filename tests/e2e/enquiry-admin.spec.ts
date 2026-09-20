import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * Enquiries, WhatsApp tracking, and admin access control.
 *
 * The admin assertions here are deliberately about being LOCKED OUT. An admin
 * panel that is reachable without a session is the worst possible bug in this
 * codebase, and it is the kind that only shows up when someone checks.
 */

const PORT = Number(process.env.PORT ?? 3000);
const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? `lvh.me:${PORT}`;
const APEX = `http://${ROOT}`;

async function html(request: APIRequestContext, url: string) {
  const response = await request.get(url, { maxRedirects: 0 });
  return {
    status: response.status(),
    body: (await response.text()).replace(/<!--[\s\S]*?-->/g, ""),
  };
}

test.describe("enquiry form", () => {
  test("appears on a tenant contact page", async ({ request }) => {
    const { status, body } = await html(request, `http://abc-electronics.${ROOT}/contact`);

    expect(status).toBe(200);
    expect(body).toContain("Send an enquiry");
    expect(body).toContain('name="message"');
    // DPDP consent must be explicit, not implied.
    expect(body).toContain('name="consent"');
  });

  test("includes the honeypot, hidden inline", async ({ request }) => {
    const { body } = await html(request, `http://abc-electronics.${ROOT}/contact`);

    expect(body).toContain('name="website"');
    // Hidden with an inline style rather than a class: a stylesheet that fails
    // to load would otherwise expose it to humans, who then fill it in and get
    // silently filtered.
    expect(body).toMatch(/position:\s*absolute/i);
  });
});

test.describe("WhatsApp click tracker", () => {
  test("redirects home without a signature, rather than erroring", async ({ request }) => {
    const response = await request.get(`${APEX}/api/wa?s=whatever`, { maxRedirects: 0 });

    expect([302, 307]).toContain(response.status());
    const location = response.headers()["location"] ?? "";
    expect(location).not.toContain("wa.me");
  });

  test("rejects a forged signature", async ({ request }) => {
    const response = await request.get(`${APEX}/api/wa?s=abc123&sig=forged`, {
      maxRedirects: 0,
    });

    expect([302, 307]).toContain(response.status());
    expect(response.headers()["location"] ?? "").not.toContain("wa.me");
  });

  test("is not an open redirect", async ({ request }) => {
    // There is no `to` parameter at all — the destination is looked up from the
    // seller record. Supplying one must change nothing.
    const response = await request.get(`${APEX}/api/wa?s=x&sig=y&to=https://evil.test`, {
      maxRedirects: 0,
    });

    const location = response.headers()["location"] ?? "";
    expect(location).not.toContain("evil.test");
  });
});

test.describe("admin is locked down", () => {
  for (const path of [
    "/admin",
    "/admin/sellers",
    "/admin/moderation",
    "/admin/settings",
    "/admin/audit-log",
  ]) {
    test(`${path} is not reachable without a session`, async ({ request }) => {
      const response = await request.get(`${APEX}${path}`, { maxRedirects: 0 });

      // Redirect to login, or an auth interrupt — never a 200.
      expect(response.status(), `${path} must not render`).not.toBe(200);
    });
  }

  test("admin pages are noindex and uncacheable", async ({ request }) => {
    const response = await request.get(`${APEX}/admin`, { maxRedirects: 0 });

    expect(response.headers()["x-robots-tag"]).toContain("noindex");
    // A shared cache holding an admin page is a cross-tenant leak.
    expect(response.headers()["cache-control"]).toContain("no-store");
  });
});

test.describe("seller dashboard is locked down", () => {
  test("the enquiry inbox requires a session", async ({ request }) => {
    const response = await request.get(`${APEX}/dashboard/enquiries`, { maxRedirects: 0 });
    expect(response.status()).not.toBe(200);
  });
});

test.describe("cron endpoints", () => {
  test("are invisible without the secret", async ({ request }) => {
    const response = await request.get(`${APEX}/api/cron/refresh-counters`, {
      maxRedirects: 0,
    });

    // 404 rather than 401: a 401 confirms the endpoint exists and invites
    // brute force, while a 404 tells a scanner nothing.
    expect(response.status()).toBe(404);
  });

  test("reject a wrong secret", async ({ request }) => {
    const response = await request.get(`${APEX}/api/cron/refresh-counters`, {
      headers: { authorization: "Bearer definitely-not-the-secret" },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(404);
  });
});

test.describe("auth pages", () => {
  test("login renders a real form", async ({ request }) => {
    const { status, body } = await html(request, `${APEX}/login`);

    expect(status).toBe(200);
    expect(body).toContain('name="email"');
    expect(body).toContain('name="password"');
  });

  test("register and password reset render", async ({ request }) => {
    for (const path of ["/register", "/forgot-password"]) {
      const { status } = await html(request, `${APEX}${path}`);
      expect(status, path).toBe(200);
    }
  });

  test("auth pages are noindex except registration", async ({ request }) => {
    const login = await html(request, `${APEX}/login`);
    expect(login.body).toContain("noindex");

    // Registration is a genuine landing page for sellers and should rank.
    const register = await html(request, `${APEX}/register`);
    expect(register.body).not.toContain('name="robots" content="noindex');
  });
});

test.describe("sitemaps", () => {
  test("the apex serves a sitemap index", async ({ request }) => {
    const response = await request.get(`${APEX}/sitemap.xml`);

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("xml");

    const body = await response.text();
    expect(body).toContain("<sitemapindex");
  });

  test("an indexable tenant serves its own URLs", async ({ request }) => {
    const response = await request.get(`http://abc-electronics.${ROOT}/sitemap.xml`);
    const body = await response.text();

    expect(body).toContain("<urlset");
    expect(body).toContain(`abc-electronics.${ROOT}/products/`);
  });

  test("a non-indexable tenant serves an empty but valid sitemap", async ({ request }) => {
    const response = await request.get(`http://sharma-steel.${ROOT}/sitemap.xml`);

    // 200 with no URLs, not a 404 — robots.txt does not advertise it, and a
    // 404 on a sitemap is reported as a crawl error.
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain("<urlset");
    expect(body).not.toContain("<url>");
  });

  test("seller and product sitemaps point at microsites, per D1", async ({ request }) => {
    const sellers = await (await request.get(`${APEX}/sitemap/sellers-0.xml`)).text();
    const products = await (await request.get(`${APEX}/sitemap/products-0.xml`)).text();

    // The microsite is canonical, and a sitemap must only advertise canonical
    // URLs — listing the marketplace copy would ask crawlers to index a page
    // that immediately points elsewhere.
    expect(sellers).toContain(`abc-electronics.${ROOT}`);
    expect(products).toContain(`abc-electronics.${ROOT}/products/`);
    expect(products).not.toContain(`${APEX}/product/`);
  });

  test("non-indexable sellers are excluded from the apex sitemap", async ({ request }) => {
    const body = await (await request.get(`${APEX}/sitemap/sellers-0.xml`)).text();

    // sharma-steel is verified but has not cleared the D2 gate. Advertising it
    // while it serves noindex would be a contradictory signal.
    expect(body).not.toContain("sharma-steel");
  });

  test("an unknown shard 404s", async ({ request }) => {
    const response = await request.get(`${APEX}/sitemap/nonsense.xml`, { maxRedirects: 0 });
    expect(response.status()).toBe(404);
  });
});
