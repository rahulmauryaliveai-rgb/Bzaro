import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * Buyer discovery pages (decision D30): the rebuilt homepage, city landing
 * pages, city × category listings and the market-only "post requirement"
 * page. Mostly HTTP-level: these are ISR pages whose value is in what they
 * render and what they 404.
 */

const PORT = Number(process.env.PORT ?? 3000);
const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? `lvh.me:${PORT}`;
const APEX = `http://${ROOT}`;

async function html(request: APIRequestContext, path: string) {
  const response = await request.get(`${APEX}${path}`, { maxRedirects: 0 });
  return {
    status: response.status(),
    body: (await response.text()).replace(/<!--[\s\S]*?-->/g, ""),
  };
}

test.describe("homepage", () => {
  test("has search, a city picker, the category grid and a post-requirement CTA", async ({
    request,
  }) => {
    const { status, body } = await html(request, "/");
    expect(status).toBe(200);
    expect(body).toContain('role="search"');
    expect(body).toContain("Choose your city");
    expect(body).toContain("Browse by category");
    expect(body).toContain("/post-requirement");
    // The block is server-rendered for the most populated city.
    expect(body).toMatch(/Popular in [A-Z]/);
  });
});

test.describe("city pages", () => {
  test("a known city renders its landing page", async ({ request }) => {
    const { status, body } = await html(request, "/mumbai");
    expect(status).toBe(200);
    expect(body).toContain("Suppliers in Mumbai");
    expect(body).toContain("Categories in Mumbai");
    expect(body).toContain('href="/mumbai/category/');
  });

  test("an unknown city is a 404, never a page (D30 guard)", async ({ request }) => {
    for (const path of ["/not-a-city", "/admin-panel", "/abc-electronics"]) {
      const { status } = await html(request, path);
      expect(status, path).toBe(404);
    }
  });

  test("static routes still win over the city segment", async ({ request }) => {
    expect((await html(request, "/sellers")).status).toBe(200);
    expect((await html(request, "/post-requirement")).status).toBe(200);
  });

  test("city × category lists sellers in that city and category", async ({ request }) => {
    const { status, body } = await html(request, "/mumbai/category/electronics/lighting/led-bulbs");
    expect(status).toBe(200);
    expect(body).toContain("LED Bulbs suppliers in Mumbai");
    expect(body).toContain("ABC Electronics");
    // A Pune seller in the same category must not appear under Mumbai.
    expect(body).not.toContain("Pune Lighting Co");
    expect(body).toContain('rel="canonical"');
  });

  test("city × unknown category is a 404", async ({ request }) => {
    expect((await html(request, "/mumbai/category/no-such-thing")).status).toBe(404);
  });
});

test.describe("post requirement", () => {
  test("renders the inline steps with a category picker", async ({ page }) => {
    await page.goto(`${APEX}/post-requirement`);
    await expect(page.getByRole("heading", { name: /Suppliers come to you/ })).toBeVisible();
    await expect(page.getByLabel("Mobile number")).toBeVisible();
  });
});

test.describe("sitemap", () => {
  test("indexes the discovery shard and it lists city pages", async ({ request }) => {
    const index = await html(request, "/sitemap.xml");
    expect(index.status).toBe(200);
    expect(index.body).toContain("/sitemap/discovery.xml");

    const shard = await html(request, "/sitemap/discovery.xml");
    expect(shard.status).toBe(200);
    expect(shard.body).toContain(`${APEX}/mumbai</loc>`);
    expect(shard.body).toContain("/mumbai/category/");
  });
});
