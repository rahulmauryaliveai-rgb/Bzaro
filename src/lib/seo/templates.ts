import { stripRich } from "@/lib/text/rich";

/**
 * Titles and meta descriptions for marketplace pages (D44).
 *
 * One place decides the wording, so it stays consistent across thousands of
 * pages and can be tuned without touching every route. Three rules:
 *
 *   1. What a person wrote wins. A seller's or admin's own meta title or
 *      description is used as-is; a real description beats any template.
 *   2. No claims we cannot back. "Manufacturer" only when the seller told us
 *      they manufacture; no "best", "#1", "cheapest", "wholesale" by default.
 *      A tutor listed under "Tuition & Coaching" must not become a "wholesale
 *      supplier" because a template said so.
 *   3. Descriptions read like a sentence a person would write, not a keyword
 *      list, and stop at a word boundary within ~155 characters.
 *
 * Pure functions: no database, no environment. Unit-tested.
 */

/** Mirrors the Prisma `BusinessType` enum without importing the client. */
export type BusinessTypeKey =
  | "MANUFACTURER"
  | "WHOLESALER"
  | "DISTRIBUTOR"
  | "TRADER"
  | "RETAILER"
  | "SERVICE_PROVIDER"
  | "EXPORTER";

export const BUSINESS_TYPE_LABEL: Record<BusinessTypeKey, string> = {
  MANUFACTURER: "Manufacturer",
  WHOLESALER: "Wholesaler",
  DISTRIBUTOR: "Distributor",
  TRADER: "Trader",
  RETAILER: "Retailer",
  SERVICE_PROVIDER: "Service provider",
  EXPORTER: "Exporter",
};

export const META_DESCRIPTION_MAX = 155;
/** Below this, a written description is too thin to stand as the snippet. */
const MIN_USEFUL_TEXT = 60;

/** Collapse whitespace and cut at a word boundary, never mid-word. */
export function clip(text: string, max = META_DESCRIPTION_MAX): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const base = (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.–-]+$/, "");
  return `${base}…`;
}

/** Plain text of a rich description when it is long enough to be a snippet. */
export function usefulText(input: string | null | undefined, min = MIN_USEFUL_TEXT): string | null {
  if (!input) return null;
  const text = stripRich(input).replace(/\s+/g, " ").trim();
  return text.length >= min ? text : null;
}

/** Trimmed non-empty override, else null. */
function own(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

/**
 * What the business is, in the words the seller gave us.
 *   MANUFACTURER + "LED Lights" → "LED Lights manufacturer"
 *   SERVICE_PROVIDER + "Printing" → "Printing services"
 *   no type + "LED Lights"       → "LED Lights business"
 *   nothing                      → null
 */
export function businessDescriptor(
  businessType: BusinessTypeKey | null | undefined,
  categoryName: string | null | undefined,
): string | null {
  const category = categoryName?.trim() || null;
  if (businessType === "SERVICE_PROVIDER") {
    return category ? `${category} services` : "Service provider";
  }
  if (businessType) {
    const noun = BUSINESS_TYPE_LABEL[businessType].toLowerCase();
    return category ? `${category} ${noun}` : BUSINESS_TYPE_LABEL[businessType];
  }
  return category ? `${category} business` : null;
}

export type SellerSeoInput = {
  businessName: string;
  businessType?: BusinessTypeKey | null;
  categoryName?: string | null;
  city?: string | null;
  description?: string | null;
  productCount?: number;
};

/** "Aggarwal Printer – Printing & Stationery trader in Greater Noida" */
export function sellerSeoTitle(input: SellerSeoInput): string {
  const descriptor = businessDescriptor(input.businessType, input.categoryName);
  const where = input.city ? ` in ${input.city}` : "";
  const full = descriptor
    ? `${input.businessName} – ${descriptor}${where}`
    : `${input.businessName}${input.city ? `, ${input.city}` : ""}`;
  // Titles past ~60 characters are cut in results; drop the descriptor first,
  // then the city, never the business name.
  if (full.length <= 62) return full;
  const withCity = `${input.businessName}${input.city ? `, ${input.city}` : ""}`;
  return withCity.length <= 62 ? withCity : input.businessName;
}

export function sellerSeoDescription(input: SellerSeoInput): string {
  const written = usefulText(input.description);
  if (written) return clip(written);

  const descriptor = businessDescriptor(input.businessType, input.categoryName);
  const what = descriptor ? ` is ${article(descriptor)} ${descriptor}` : "";
  const where = input.city ? `${what ? "" : " is"} based in ${input.city}` : "";
  const lead =
    what || where
      ? `${input.businessName}${what}${where}.`
      : `${input.businessName} is listed on Bzaro.`;
  const count = input.productCount && input.productCount > 0;
  const tail = count
    ? ` See ${input.productCount} product${input.productCount === 1 ? "" : "s"}, business details and send an enquiry on Bzaro.`
    : " See business details and send an enquiry on Bzaro.";
  return clip(`${lead}${tail}`);
}

export type ProductSeoInput = {
  name: string;
  sellerName: string;
  city?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  shortDescription?: string | null;
  description?: string | null;
  /** Already formatted, e.g. "₹450 / piece" or "Price on request". */
  priceLabel?: string | null;
  minOrderLabel?: string | null;
  brand?: string | null;
};

/** "Customised School Notebooks – Aggarwal Printer, Greater Noida" */
export function productSeoTitle(input: ProductSeoInput): string {
  const override = own(input.metaTitle);
  if (override) return override;
  const full = `${input.name} – ${input.sellerName}${input.city ? `, ${input.city}` : ""}`;
  if (full.length <= 65) return full;
  const noCity = `${input.name} – ${input.sellerName}`;
  return noCity.length <= 65 ? noCity : input.name;
}

export function productSeoDescription(input: ProductSeoInput): string {
  const override = own(input.metaDescription);
  if (override) return clip(override);
  const written = usefulText(input.shortDescription) ?? usefulText(input.description);
  if (written) return clip(written);

  const by = `${input.brand ? `${input.brand} ` : ""}${input.name} from ${input.sellerName}${input.city ? ` in ${input.city}` : ""}.`;
  const price = input.priceLabel ? ` ${input.priceLabel}.` : "";
  const moq = input.minOrderLabel ? ` Minimum order ${input.minOrderLabel}.` : "";
  return clip(`${by}${price}${moq} Send an enquiry on Bzaro to get a quote.`);
}

export type CategorySeoInput = {
  name: string;
  metaTitle?: string | null;
  metaDescription?: string | null;
  description?: string | null;
  productCount?: number;
  cities?: string[];
};

/** "LED Lights – suppliers & products in India" */
export function categorySeoTitle(input: CategorySeoInput): string {
  return own(input.metaTitle) ?? `${input.name} – suppliers & products in India`;
}

export function categorySeoDescription(input: CategorySeoInput): string {
  const override = own(input.metaDescription);
  if (override) return clip(override);
  const written = usefulText(input.description);
  if (written) return clip(written);

  const count = input.productCount && input.productCount > 0 ? `${input.productCount} ` : "";
  const cities = (input.cities ?? []).slice(0, 3);
  const where = cities.length ? ` in ${joinList(cities)}` : " across India";
  return clip(
    `Compare ${count}${input.name} products from verified suppliers${where}. Check prices and send one enquiry to get quotes.`,
  );
}

/** "LED Lights suppliers in Noida" */
export function cityCategorySeoTitle(categoryName: string, city: string): string {
  return `${categoryName} suppliers in ${city}`;
}

export function cityCategorySeoDescription(
  categoryName: string,
  city: string,
  sellerCount?: number,
): string {
  const count = sellerCount && sellerCount > 0 ? `${sellerCount} ` : "";
  return clip(
    `Find ${count}${categoryName} suppliers in ${city}. Compare products and business details, then contact suppliers directly or post one requirement.`,
  );
}

function article(word: string): "a" | "an" {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
