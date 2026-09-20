import { describe, expect, it } from "vitest";
import { productJsonLd, sellerJsonLd, serializeJsonLd } from "@/lib/seo/jsonld";
import type { SellerPublic } from "@/lib/tenant/context";

/**
 * Structured data.
 *
 * Two things are being protected here:
 *
 *   1. The escaping. JSON-LD is the one place the codebase uses
 *      dangerouslySetInnerHTML, so the serialiser is the only thing standing
 *      between a seller's business name and a script injection on a domain
 *      shared by every other seller.
 *   2. Honesty. Emitting an Offer with no price, or a rating with no reviews,
 *      is structured-data spam — and the resulting manual action lands on the
 *      root domain, taking every seller with it.
 */

function seller(overrides: Partial<SellerPublic> = {}): SellerPublic {
  return {
    id: "s1",
    slug: "abc-electronics",
    businessName: "ABC Electronics",
    legalName: null,
    tagline: null,
    description: "We make lights.",
    logoUrl: null,
    coverImageUrl: null,
    email: "a@b.test",
    phone: "+919876543210",
    whatsapp: null,
    websiteUrl: null,
    address: {
      line1: "Plot 14",
      line2: null,
      postalCode: "400001",
      city: "Mumbai",
      state: null,
      latitude: null,
      longitude: null,
    },
    establishedYear: 2009,
    employeeCount: "11-50",
    gstin: null,
    gstinVerified: false,
    certifications: [],
    businessHours: null,
    timezone: "Asia/Kolkata",
    locale: "en",
    socialLinks: {},
    ratingAvg: 0,
    ratingCount: 0,
    productCount: 5,
    serviceCount: 2,
    isVerified: true,
    ...overrides,
  };
}

describe("serializeJsonLd", () => {
  it("escapes angle brackets so a payload cannot close the script tag", () => {
    const output = serializeJsonLd({ name: "</script><img onerror=alert(1)>" });

    expect(output).not.toContain("</script>");
    expect(output).not.toContain("<img");
    expect(output).toContain("\\u003c");
  });

  it("escapes ampersands", () => {
    expect(serializeJsonLd({ name: "Tata & Sons" })).toContain("\\u0026");
  });

  it("still parses back to the original value", () => {
    // The escaping must be transparent to JSON parsers — otherwise we have
    // protected ourselves by breaking the feature.
    const original = { name: "A <b> & C" };
    expect(JSON.parse(serializeJsonLd(original))).toEqual(original);
  });
});

describe("sellerJsonLd", () => {
  it("emits LocalBusiness with core fields", () => {
    const data = sellerJsonLd(seller(), "https://abc.example.com");
    expect(data["@type"]).toBe("LocalBusiness");
    expect(data.name).toBe("ABC Electronics");
    expect(data.telephone).toBe("+919876543210");
  });

  it("omits aggregateRating when there are no reviews", () => {
    // Review markup with zero reviews behind it earns a manual action.
    const data = sellerJsonLd(seller({ ratingCount: 0 }), "https://abc.example.com");
    expect(data.aggregateRating).toBeUndefined();
  });

  it("includes aggregateRating once reviews exist", () => {
    const data = sellerJsonLd(
      seller({ ratingCount: 12, ratingAvg: 4.25 }),
      "https://abc.example.com",
    );
    expect(data.aggregateRating).toMatchObject({ reviewCount: 12, ratingValue: "4.3" });
  });

  it("drops empty optional fields entirely", () => {
    const data = sellerJsonLd(
      seller({ logoUrl: null, legalName: null }),
      "https://abc.example.com",
    );
    expect("logo" in data).toBe(false);
    expect("legalName" in data).toBe(false);
  });

  it("omits the address when there is nothing but a country", () => {
    const data = sellerJsonLd(
      seller({
        address: {
          line1: null,
          line2: null,
          postalCode: null,
          city: null,
          state: null,
          latitude: null,
          longitude: null,
        },
      }),
      "https://abc.example.com",
    );
    expect(data.address).toBeUndefined();
  });
});

describe("productJsonLd", () => {
  const base = {
    name: "LED Panel 40W",
    description: "A panel.",
    shortDescription: null,
    brand: "ABC",
    sku: "ABC-1",
    currency: "INR",
    images: [{ url: "https://cdn.example/a.jpg" }],
  };

  it("emits an Offer when a real price exists", () => {
    const data = productJsonLd({
      product: { ...base, priceMinor: 129_000, priceOnRequest: false },
      url: "https://abc.example.com/products/led-panel-40w",
      sellerName: "ABC Electronics",
    });

    expect(data.offers).toMatchObject({ price: "1290.00", priceCurrency: "INR" });
  });

  it("omits the Offer for price-on-request products", () => {
    // "Price on request" is the norm in this market. Inventing a number to
    // satisfy a validator is exactly the spam Google penalises.
    const data = productJsonLd({
      product: { ...base, priceMinor: null, priceOnRequest: true },
      url: "https://abc.example.com/products/x",
      sellerName: "ABC Electronics",
    });

    expect(data.offers).toBeUndefined();
  });

  it("omits the Offer when the flag says otherwise but no price is set", () => {
    const data = productJsonLd({
      product: { ...base, priceMinor: null, priceOnRequest: false },
      url: "https://abc.example.com/products/x",
      sellerName: "ABC Electronics",
    });

    expect(data.offers).toBeUndefined();
  });
});
