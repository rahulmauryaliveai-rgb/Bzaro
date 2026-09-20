import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Decision D32: web presence is a plan tier.
 *
 *   free / basic → catalogue page on the apex, subdomain 301s there
 *   gold         → subdomain website, marketplace pages canonical to it
 *
 * Fixtures: delhi-led-house is on Basic (catalogue), abc-electronics on Gold.
 * The last test moves noida-lights (Free) up to Gold from the admin page and
 * back, proving the subdomain follows the plan without a redeploy.
 */

const PORT = Number(process.env.PORT ?? 3000);
const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? `lvh.me:${PORT}`;
const APEX = `http://${ROOT}`;
const PASSWORD = "devpassword123";

const tenant = (slug: string, path = "/") => `http://${slug}.${ROOT}${path}`;

async function raw(request: APIRequestContext, url: string) {
  return request.get(url, { maxRedirects: 0 });
}

async function login(page: Page, email: string, next = "/dashboard") {
  await page.goto(`${APEX}/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/(dashboard|admin)/);
}

test.describe("catalogue tier", () => {
  test("the subdomain 301s to the marketplace catalogue page, path preserved", async ({
    request,
  }) => {
    const home = await raw(request, tenant("delhi-led-house"));
    expect([301, 308]).toContain(home.status());
    expect(home.headers()["location"]).toBe(`${APEX}/seller/delhi-led-house`);

    const product = await raw(request, tenant("delhi-led-house", "/products/some-bulb"));
    expect([301, 308]).toContain(product.status());
    expect(product.headers()["location"]).toBe(`${APEX}/product/delhi-led-house/some-bulb`);

    const about = await raw(request, tenant("delhi-led-house", "/about"));
    expect(about.headers()["location"]).toBe(`${APEX}/seller/delhi-led-house`);
  });

  test("the marketplace page is canonical and offers no website link", async ({ request }) => {
    const response = await raw(request, `${APEX}/seller/delhi-led-house`);
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain(`<link rel="canonical" href="${APEX}/seller/delhi-led-house"/>`);
    expect(body).not.toContain("Visit website");
  });

  test("the dashboard shows the catalogue link and the upgrade ladder", async ({ page }) => {
    await login(page, "owner@delhi-led-house.test");
    await page.goto(`${APEX}/dashboard/website`);
    await expect(page.getByRole("heading", { name: "Your catalogue page" })).toBeVisible();
    await expect(page.getByText(`${ROOT}/seller/delhi-led-house`)).toBeVisible();
    await expect(page.getByRole("heading", { name: /own web address/ })).toBeVisible();
    // Only tiers above the seller's own are offered.
    await expect(page.getByRole("link", { name: "Upgrade" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: /Publish site/ })).toHaveCount(0);
  });
});

test.describe("subdomain tier", () => {
  test("the subdomain serves and the marketplace page canonicals to it", async ({ request }) => {
    expect((await raw(request, tenant("abc-electronics"))).status()).toBe(200);

    const body = await (await raw(request, `${APEX}/seller/abc-electronics`)).text();
    expect(body).toContain(`<link rel="canonical" href="${tenant("abc-electronics", "")}"/>`);
    expect(body).toContain("Visit website");
  });
});

test.describe("pricing", () => {
  test("lists the seeded ladder with the web-presence line per plan", async ({ request }) => {
    const body = await (await raw(request, `${APEX}/pricing`)).text();
    expect(body).toContain("Catalogue page on Bzaro");
    expect(body).toContain("Your own website");
  });
});

test.describe("plan change follows through to routing", () => {
  test("admin moves a Free seller to Gold and the subdomain starts serving", async ({
    page,
    request,
  }) => {
    await login(page, "admin@bzaro.test", "/admin");
    await page.goto(`${APEX}/admin/sellers`);
    await page
      .getByRole("link", { name: /Noida Lights/ })
      .first()
      .click();
    await page.waitForURL(/\/admin\/sellers\//);
    const sellerUrl = page.url();

    // Baseline regardless of what an earlier run left behind: Free.
    await page.getByLabel("Move to plan").selectOption({ label: "Free · catalogue" });
    await page.getByRole("button", { name: "Change plan" }).click();
    await expect(page.getByText("CATALOGUE", { exact: true })).toBeVisible();
    expect([301, 308]).toContain((await raw(request, tenant("noida-lights"))).status());

    await page.goto(sellerUrl);
    await page.getByLabel("Move to plan").selectOption({ label: "Gold · subdomain" });
    await page.getByRole("button", { name: "Change plan" }).click();
    await expect(page.getByText("SUBDOMAIN", { exact: true })).toBeVisible();

    expect((await raw(request, tenant("noida-lights"))).status()).toBe(200);

    // And back down: the subdomain redirects again, nothing 404s.
    await page.goto(sellerUrl);
    await page.getByLabel("Move to plan").selectOption({ label: "Free · catalogue" });
    await page.getByRole("button", { name: "Change plan" }).click();
    await expect(page.getByText("CATALOGUE", { exact: true })).toBeVisible();

    const after = await raw(request, tenant("noida-lights"));
    expect([301, 308]).toContain(after.status());
    expect(after.headers()["location"]).toBe(`${APEX}/seller/noida-lights`);
  });
});
