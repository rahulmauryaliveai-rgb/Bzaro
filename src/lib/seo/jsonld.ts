import type { SellerPublic } from "@/lib/tenant/context";
import { parseBusinessHours, toSchemaOpeningHours } from "@/lib/utils/hours";
import { priceForSchema } from "@/lib/utils/money";

/**
 * schema.org structured data.
 *
 * ── The escaping, and why this file is an ESLint exception ───────────────────
 * JSON-LD has to be injected as raw text inside a <script> tag, which is the
 * one place `dangerouslySetInnerHTML` is unavoidable. It is therefore the ONLY
 * sanctioned use in the codebase, and `eslint.config.mjs` exempts this file by
 * name.
 *
 * The danger is concrete: a seller whose business name contains `</script>`
 * would otherwise close the tag and everything after it becomes live markup.
 * `serializeJsonLd` escapes `<`, `>` and `&` into unicode escapes, which JSON
 * parsers read identically but an HTML tokenizer cannot act on.
 *
 * ── Honesty rules ────────────────────────────────────────────────────────────
 * Never emit a field we do not actually have. An `Offer` with a fabricated
 * price, or an `aggregateRating` with zero reviews, is structured-data spam —
 * it earns a manual action, and on a shared root domain that penalty is shared
 * by every seller.
 */

export type JsonLdObject = Record<string, unknown>;

/**
 * Serialise for embedding in a <script> tag.
 *
 * `<` → `<` etc. This is standard practice and is what every framework's
 * JSON-LD helper does internally.
 */
export function serializeJsonLd(data: JsonLdObject | JsonLdObject[]): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

/** Drop null/undefined/empty values so no empty schema fields are emitted. */
function compact<T extends JsonLdObject>(object: T): T {
  const result: JsonLdObject = {};
  for (const [key, value] of Object.entries(object)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    result[key] = value;
  }
  return result as T;
}

/**
 * LocalBusiness for the seller.
 *
 * `LocalBusiness` rather than plain `Organization`: these are physical
 * suppliers with an address and opening hours, and LocalBusiness is what powers
 * local pack results — which is where a B2B supplier actually wants to appear.
 */
export function sellerJsonLd(seller: SellerPublic, baseUrl: string): JsonLdObject {
  const hours = parseBusinessHours(seller.businessHours);

  const address = compact({
    "@type": "PostalAddress",
    streetAddress: [seller.address.line1, seller.address.line2].filter(Boolean).join(", "),
    addressLocality: seller.address.city,
    addressRegion: seller.address.state,
    postalCode: seller.address.postalCode,
    addressCountry: "IN",
  });

  return compact({
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${baseUrl}#business`,
    name: seller.businessName,
    legalName: seller.legalName,
    description: seller.description,
    url: baseUrl,
    telephone: seller.phone,
    email: seller.email,
    image: seller.coverImageUrl ?? seller.logoUrl,
    logo: seller.logoUrl,
    foundingDate: seller.establishedYear ? String(seller.establishedYear) : null,
    numberOfEmployees: seller.employeeCount,
    // Only include the address when there is a real one — a PostalAddress
    // consisting solely of addressCountry is noise.
    address: Object.keys(address).length > 2 ? address : null,
    geo:
      seller.address.latitude !== null && seller.address.longitude !== null
        ? {
            "@type": "GeoCoordinates",
            latitude: seller.address.latitude,
            longitude: seller.address.longitude,
          }
        : null,
    openingHoursSpecification: hours ? toSchemaOpeningHours(hours) : null,
    sameAs: Object.values(seller.socialLinks).filter(
      (url): url is string => typeof url === "string" && url.length > 0,
    ),
    // Ratings are emitted ONLY with at least one real review. Google issues
    // manual actions for review markup with no reviews behind it.
    aggregateRating:
      seller.ratingCount > 0
        ? {
            "@type": "AggregateRating",
            ratingValue: seller.ratingAvg.toFixed(1),
            reviewCount: seller.ratingCount,
          }
        : null,
  });
}

export function productJsonLd(params: {
  product: {
    name: string;
    description: string | null;
    shortDescription: string | null;
    brand: string | null;
    sku: string | null;
    priceMinor: number | null;
    currency: string;
    priceOnRequest: boolean;
    images: Array<{ url: string }>;
  };
  url: string;
  sellerName: string;
}): JsonLdObject {
  const { product } = params;

  return compact({
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description ?? product.shortDescription,
    sku: product.sku,
    image: product.images.map((image) => image.url),
    brand: product.brand ? { "@type": "Brand", name: product.brand } : null,
    // No Offer without a real price. "Price on request" is the norm in this
    // market, and inventing a number to satisfy a validator is exactly the
    // spam Google penalises.
    offers:
      !product.priceOnRequest && product.priceMinor !== null
        ? {
            "@type": "Offer",
            price: priceForSchema(product.priceMinor, product.currency),
            priceCurrency: product.currency,
            availability: "https://schema.org/InStock",
            url: params.url,
            seller: { "@type": "Organization", name: params.sellerName },
          }
        : null,
  });
}

export function serviceJsonLd(params: {
  service: {
    name: string;
    description: string | null;
    shortDescription: string | null;
    serviceAreas: string[];
    priceMinor: number | null;
    currency: string;
    priceOnRequest: boolean;
  };
  url: string;
  sellerName: string;
  baseUrl: string;
}): JsonLdObject {
  const { service } = params;

  return compact({
    "@context": "https://schema.org",
    "@type": "Service",
    name: service.name,
    description: service.description ?? service.shortDescription,
    url: params.url,
    provider: {
      "@type": "LocalBusiness",
      "@id": `${params.baseUrl}#business`,
      name: params.sellerName,
    },
    areaServed: service.serviceAreas.map((area) => ({ "@type": "Place", name: area })),
    offers:
      !service.priceOnRequest && service.priceMinor !== null
        ? {
            "@type": "Offer",
            price: priceForSchema(service.priceMinor, service.currency),
            priceCurrency: service.currency,
          }
        : null,
  });
}

export function breadcrumbJsonLd(
  trail: Array<{ href: string; label: string }>,
  baseUrl: string,
): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.label,
      item: new URL(crumb.href, baseUrl).toString(),
    })),
  };
}

export function itemListJsonLd(
  items: Array<{ name: string; href: string }>,
  baseUrl: string,
): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      url: new URL(item.href, baseUrl).toString(),
    })),
  };
}
