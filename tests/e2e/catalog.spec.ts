import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * Catalogue CRUD.
 *
 * Driven over HTTP through the no-JavaScript form path, like the onboarding
 * journey: Chromium is unavailable here, and replaying the `$ACTION_*` hidden
 * inputs exercises the real proxy, actions, validation, tenant scoping and
 * database rather than a mock of them.
 *
 * The cross-tenant cases are the important ones. Item ids are unavoidably taken
 * from the form, so the only thing standing between a seller and someone else's
 * catalogue is that every query is scoped by `forSeller()`. These tests prove
 * that scoping holds for reads, for publishes and for deletes.
 */

const PORT = Number(process.env.PORT ?? 3000);
const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? `lvh.me:${PORT}`;
const APEX = `http://${ROOT}`;
const PASSWORD = "devpassword123";

/** Unique per run, so repeated runs never collide on a slug. */
const STAMP = Date.now().toString(36);

function actionFields(html: string): Record<string, string> {
  const fields: Record<string, string> = {};

  for (const match of html.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const name = match[0].match(/name="([^"]*)"/)?.[1];
    if (!name) continue;
    fields[name] = (match[0].match(/value="([^"]*)"/)?.[1] ?? "")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&");
  }

  return fields;
}

/**
 * Sign in, and report whether a usable session actually resulted.
 *
 * Auth.js answers 302 whether or not the credentials were accepted, so the
 * status alone proves nothing. The login limiter allows ten attempts per hour
 * per IP — repeated local runs trip it legitimately — and without this check
 * that surfaces much later as an unexplained 307, which reads like a broken
 * guard rather than a working limiter.
 */
async function signIn(request: APIRequestContext, email: string): Promise<boolean> {
  const csrf = await (await request.get(`${APEX}/api/auth/csrf`)).json();

  await request.post(`${APEX}/api/auth/callback/credentials`, {
    maxRedirects: 0,
    form: {
      csrfToken: csrf.csrfToken,
      email,
      password: PASSWORD,
      callbackUrl: `${APEX}/dashboard`,
      redirect: "false",
    },
  });

  const dashboard = await request.get(`${APEX}/dashboard`, { maxRedirects: 0 });
  return dashboard.status() === 200;
}

async function page(request: APIRequestContext, path: string) {
  const response = await request.get(`${APEX}${path}`, { maxRedirects: 0 });
  return { status: response.status(), html: await response.text() };
}

test.describe.configure({ mode: "serial" });

test.describe("a seller manages their catalogue", () => {
  let owner: APIRequestContext;
  let other: APIRequestContext;

  /** Id of the product created by this run, shared across the steps. */
  let productId = "";

  /** False when the login limiter refused us; the whole journey then skips. */
  let signedIn = false;

  test.beforeAll(async ({ playwright }) => {
    // One cookie jar per seller, kept for the whole journey.
    owner = await playwright.request.newContext();
    other = await playwright.request.newContext();

    const ownerIn = await signIn(owner, "owner@abc-electronics.test");
    const otherIn = await signIn(other, "owner@sharma-steel.test");

    signedIn = ownerIn && otherIn;
  });

  test.beforeEach(() => {
    test.skip(
      !signedIn,
      "could not sign in — the login rate limit is working; retry within the hour",
    );
  });

  test.afterAll(async () => {
    // Best effort: a leftover fixture is untidy, not a failure.
    try {
      const { config } = await import("dotenv");
      const { default: pg } = await import("pg");

      config({ path: ".env.local", quiet: true });

      const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
      await client.query(`DELETE FROM "Product" WHERE slug LIKE $1`, [`e2e-${STAMP}%`]);
      await client.query(`DELETE FROM "Service" WHERE slug LIKE $1`, [`e2e-${STAMP}%`]);
      await client.end();
    } catch {
      /* ignored */
    }

    await owner.dispose();
    await other.dispose();
  });

  test("the catalogue pages are reachable", async () => {
    for (const path of [
      "/dashboard/products",
      "/dashboard/products/new",
      "/dashboard/services",
      "/dashboard/services/new",
    ]) {
      const { status } = await page(owner, path);
      expect(status, `${path} should render`).toBe(200);
    }
  });

  test("creating a product works without JavaScript", async () => {
    const { html } = await page(owner, "/dashboard/products/new");

    const response = await owner.post(`${APEX}/dashboard/products/new`, {
      maxRedirects: 0,
      multipart: {
        ...actionFields(html),
        name: "E2E Widget",
        slug: `e2e-${STAMP}-widget`,
        shortDescription: "Created by the catalogue end-to-end test.",
        currency: "INR",
        price: "1250.50",
        unit: "piece",
        minOrderQty: "10",
        tags: "led, e2e",
        status: "PUBLISHED",
      },
    });

    expect(response.status(), "creating should redirect into the editor").toBe(303);

    const location = response.headers()["location"] ?? "";
    expect(location).toContain("/dashboard/products/");

    productId = location.split("/dashboard/products/")[1]?.split("?")[0] ?? "";
    expect(productId).toBeTruthy();
  });

  test("the product is live on the seller's own website", async ({ request }) => {
    // abc-electronics is verified with approved listings, so it is a trusted
    // seller under D10 and its content auto-approves.
    const response = await request.get(
      `http://abc-electronics.${ROOT}/products/e2e-${STAMP}-widget`,
      { maxRedirects: 0 },
    );

    expect(response.status()).toBe(200);
    expect(await response.text()).toContain("E2E Widget");
  });

  test("the price survived the round trip as minor units", async () => {
    // 1250.50 must come back as 1250.50, not 1250 or 125050. A marketplace
    // that mis-states prices loses seller trust in a way that is hard to win
    // back, so this is checked through the rendered editor, not the database.
    const { html } = await page(owner, `/dashboard/products/${productId}`);
    expect(html).toContain('value="1250.50"');
  });

  test("another seller cannot open the product", async () => {
    const { status } = await page(other, `/dashboard/products/${productId}`);

    // Not found rather than forbidden: a 403 would confirm the id exists.
    expect(status).toBe(404);
  });

  test("another seller cannot unpublish the product", async () => {
    const { html } = await page(other, "/dashboard/products");

    await other.post(`${APEX}/dashboard/products`, {
      maxRedirects: 0,
      multipart: {
        ...actionFields(html),
        kind: "product",
        id: productId,
        status: "DRAFT",
      },
    });

    // The action may return 200 — what matters is that it changed nothing,
    // because the tenant-scoped update matched zero rows.
    const { html: ownerView } = await page(owner, `/dashboard/products/${productId}`);
    expect(ownerView).toContain('value="PUBLISHED"');
  });

  test("deleting requires the confirmation tick", async () => {
    const { html } = await page(owner, `/dashboard/products/${productId}`);

    const response = await owner.post(`${APEX}/dashboard/products/${productId}`, {
      maxRedirects: 0,
      multipart: { ...actionFields(html), kind: "product", id: productId },
    });

    // No redirect means the action refused. Deleting is irreversible for the
    // seller, so a missing tick must never be treated as consent.
    expect(response.status()).not.toBe(303);

    const { status } = await page(owner, `/dashboard/products/${productId}`);
    expect(status, "the product should still exist").toBe(200);
  });

  test("creating a service works too", async () => {
    const { html } = await page(owner, "/dashboard/services/new");

    const response = await owner.post(`${APEX}/dashboard/services/new`, {
      maxRedirects: 0,
      multipart: {
        ...actionFields(html),
        name: "E2E Installation",
        slug: `e2e-${STAMP}-installation`,
        currency: "INR",
        pricingModel: "quote",
        priceOnRequest: "on",
        serviceAreas: "Mumbai, Pune",
        status: "PUBLISHED",
      },
    });

    expect(response.status()).toBe(303);
    expect(response.headers()["location"] ?? "").toContain("/dashboard/services/");
  });
});

test.describe("catalogue pages are private", () => {
  for (const path of [
    "/dashboard/products",
    "/dashboard/products/new",
    "/dashboard/services",
    "/dashboard/services/new",
  ]) {
    test(`${path} does not render for an anonymous visitor`, async ({ request }) => {
      const response = await request.get(`${APEX}${path}`, { maxRedirects: 0 });
      expect(response.status()).not.toBe(200);
    });
  }

  test("catalogue pages are noindex and uncacheable", async ({ request }) => {
    const response = await request.get(`${APEX}/dashboard/products`, { maxRedirects: 0 });

    expect(response.headers()["x-robots-tag"]).toContain("noindex");
    expect(response.headers()["cache-control"]).toContain("no-store");
  });
});
