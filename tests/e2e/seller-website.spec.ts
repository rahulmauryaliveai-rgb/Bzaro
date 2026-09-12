import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * The dynamic seller website.
 *
 * Complements tenant-isolation.spec.ts: that suite proves tenants stay
 * separate, this one proves each tenant's site actually renders its own data
 * across all six pages.
 *
 * Fixtures come from prisma/seed/catalog.ts. abc-electronics is deliberately
 * rich, sharma-steel deliberately sparse.
 */

const PORT = Number(process.env.PORT ?? 3000);
const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? `lvh.me:${PORT}`;

const ABC = `http://abc-electronics.${ROOT}`;
const SHARMA = `http://sharma-steel.${ROOT}`;

async function html(request: APIRequestContext, url: string) {
  const response = await request.get(url, { maxRedirects: 0 });
  expect(response.status(), `expected 200 from ${url}`).toBe(200);
  return response.text();
}

test.describe("every page renders the seller's own data", () => {
  test("home shows business, products and services", async ({ request }) => {
    const body = await html(request, ABC);

    expect(body).toContain("ABC Electronics");
    expect(body).toContain("LED Panel Light 40W");
    expect(body).toContain("Lighting Design");
  });

  test("about shows the description and business facts", async ({ request }) => {
    const body = await html(request, `${ABC}/about`);

    expect(body).toContain("ABC Electronics");
    expect(body).toContain("2009");
  });

  test("products lists the catalogue", async ({ request }) => {
    const body = await html(request, `${ABC}/products`);

    expect(body).toContain("LED Panel Light 40W");
    expect(body).toContain("LED Bulb 9W B22");
  });

  test("product detail shows price, specifications and SKU", async ({ request }) => {
    const body = await html(request, `${ABC}/products/led-panel-40w`);

    expect(body).toContain("ABC-LP-40W");
    expect(body).toContain("Luminous flux");
    expect(body).toContain("3600 lm");
    // 129000 paise must render as ₹1,290 — not ₹129,000.
    expect(body).toContain("1,290");
  });

  test("price-on-request products say so rather than showing a broken price", async ({
    request,
  }) => {
    const body = await html(request, `${ABC}/products/copper-cable-2-5mm`);

    expect(body).toContain("Price on request");
    expect(body).not.toContain("NaN");
    expect(body).not.toContain("₹0");
  });

  test("services list and detail render", async ({ request }) => {
    const list = await html(request, `${ABC}/services`);
    expect(list).toContain("Lighting Design");

    const detail = await html(request, `${ABC}/services/lighting-design-consultation`);
    expect(detail).toContain("DIALux");
    expect(detail).toContain("Mumbai");
  });

  test("gallery renders images", async ({ request }) => {
    const body = await html(request, `${ABC}/gallery`);
    expect(body).toContain("Production floor");
  });

  test("contact shows phone, address and business hours", async ({ request }) => {
    const body = await html(request, `${ABC}/contact`);

    expect(body).toContain("Business hours");
    expect(body).toContain("Monday");
    expect(body).toContain("Plot 14");
  });
});

test.describe("content stays inside its tenant", () => {
  test("one seller's catalogue never appears on another's site", async ({ request }) => {
    const sharma = await html(request, `${SHARMA}/products`);

    expect(sharma).toContain("TMT Bar");
    // The single most important assertion in this file.
    expect(sharma).not.toContain("LED Panel Light 40W");
    expect(sharma).not.toContain("ABC Electronics");
  });

  test("a product slug from another tenant 404s", async ({ request }) => {
    // Product slugs are unique per tenant, so this slug exists — but not for
    // this seller. Resolving it would mean the sellerId filter was dropped.
    const response = await request.get(`${SHARMA}/products/led-panel-40w`, { maxRedirects: 0 });
    expect(response.status()).toBe(404);
  });
});

test.describe("empty states degrade gracefully", () => {
  test("a seller with no services shows an empty state, not an error", async ({ request }) => {
    const body = await html(request, `${SHARMA}/services`);
    expect(body).toContain("No services listed yet");
  });

  test("a seller with no gallery shows an empty state", async ({ request }) => {
    const body = await html(request, `${SHARMA}/gallery`);
    expect(body).toContain("No photos yet");
  });

  test("navigation hides sections the seller has no content for", async ({ request }) => {
    const body = await html(request, SHARMA);
    // sharma-steel has one product but no services and no gallery, so those
    // nav items must be absent — an empty section is a thin page (D2).
    expect(body).toContain('href="/products"');
    expect(body).not.toContain('href="/services"');
  });
});

test.describe("SEO", () => {
  test("product pages carry Product and Breadcrumb structured data", async ({ request }) => {
    const body = await html(request, `${ABC}/products/led-panel-40w`);

    expect(body).toContain("application/ld+json");
    expect(body).toContain('"@type":"Product"');
    expect(body).toContain('"@type":"BreadcrumbList"');
    // A priced product must carry an Offer.
    expect(body).toContain('"@type":"Offer"');
  });

  test("the home page carries LocalBusiness data", async ({ request }) => {
    const body = await html(request, ABC);
    expect(body).toContain('"@type":"LocalBusiness"');
  });

  test("structured data never contains a raw closing script tag", async ({ request }) => {
    const body = await html(request, `${ABC}/products/led-panel-40w`);
    const blocks = body.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) ?? [];

    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      const payload = block.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "");
      expect(payload).not.toContain("<");
      expect(payload).not.toContain(">");
    }
  });

  test("every page has a self-referencing canonical on the tenant host", async ({ request }) => {
    for (const path of ["/", "/about", "/products", "/services", "/gallery", "/contact"]) {
      const body = await html(request, `${ABC}${path}`);
      const match = body.match(/<link rel="canonical" href="([^"]+)"/);

      expect(match, `no canonical on ${path}`).not.toBeNull();
      // Canonical must point at the seller's own host (decision D1), never the
      // apex, and must carry no query string.
      expect(match![1]).toContain(`abc-electronics.${ROOT}`);
      expect(match![1]).not.toContain("?");
    }
  });

  test("a non-indexable seller's pages are noindex throughout", async ({ request }) => {
    for (const path of ["/", "/products", "/contact"]) {
      const body = await html(request, `${SHARMA}${path}`);
      expect(body, `${path} should be noindex`).toContain("noindex");
    }
  });

  test("deep pagination is noindex", async ({ request }) => {
    const response = await request.get(`${ABC}/products?page=9`, { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain("noindex");
  });
});

test.describe("WhatsApp call-to-action", () => {
  test("product pages deep-link with a contextual pre-filled message", async ({ request }) => {
    const body = await html(request, `${ABC}/products/led-panel-40w`);

    const match = body.match(/https:\/\/wa\.me\/(\d+)\?text=([^"]+)/);
    expect(match, "no wa.me link found").not.toBeNull();

    // Digits only — a leading + produces "phone number is invalid" in WhatsApp.
    expect(match![1]).toMatch(/^\d{8,15}$/);

    const message = decodeURIComponent(match![2]!.replace(/&amp;/g, "&"));
    expect(message).toContain("LED Panel Light 40W");

    // Read from configuration rather than hardcoding the brand: this assertion
    // is that the message NAMES the platform, so a buyer knows where the
    // enquiry came from. Pinning the literal name here just makes the test
    // break the next time the platform is renamed, which is not a defect.
    expect(message).toContain(process.env.NEXT_PUBLIC_PLATFORM_NAME ?? "Bzaro");
  });
});
