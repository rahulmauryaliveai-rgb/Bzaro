/**
 * Profile completion — the bar on the dashboard.
 *
 * Distinct from the D2 indexability gate (src/lib/validation/index-eligibility):
 * that answers "may search engines index this site" with hard rules; this
 * answers "how much of the profile has the seller filled in" with a score, and
 * it is allowed to reward things the gate does not require (certifications,
 * a second category). Both are pure and unit-tested.
 *
 * Weights sum to 100. Each item names the page that fixes it.
 */

export type CompletionInput = {
  businessName: string;
  description: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  businessType: string | null;
  addressLine1: string | null;
  postalCode: string | null;
  locationId: string | null;
  phone: string | null;
  whatsapp: string | null;
  phoneVerified: boolean;
  gstin: string | null;
  establishedYear: number | null;
  employeeCount: string | null;
  annualTurnover: string | null;
  certifications: string[];
  categoryCount: number;
  serviceAreaCount: number;
  publishedProducts: number;
  galleryItems: number;
  websitePublished: boolean;
};

export type CompletionItem = {
  key: string;
  label: string;
  weight: number;
  done: boolean;
  href: string;
};

export type CompletionResult = {
  /** 0–100. */
  score: number;
  items: CompletionItem[];
  /** The highest-weight things still missing, for the "next up" nudge. */
  next: CompletionItem[];
};

export function computeCompletion(input: CompletionInput): CompletionResult {
  const items: CompletionItem[] = [
    item(
      "phone_verified",
      "Verify your mobile number",
      12,
      input.phoneVerified,
      "/dashboard/settings",
    ),
    item("whatsapp", "Add a WhatsApp number", 6, Boolean(input.whatsapp), "/dashboard/profile"),
    item(
      "business_type",
      "Choose your business type",
      5,
      Boolean(input.businessType),
      "/dashboard/profile",
    ),
    item(
      "address",
      "Add your address and PIN code",
      6,
      Boolean(input.addressLine1 && input.postalCode && input.locationId),
      "/dashboard/profile",
    ),
    item("category", "Choose your categories", 8, input.categoryCount >= 1, "/dashboard/profile"),
    item(
      "service_areas",
      "Add the cities you serve",
      5,
      input.serviceAreaCount >= 1,
      "/dashboard/profile",
    ),
    item(
      "description",
      "Describe your business (150+ characters)",
      10,
      (input.description?.trim().length ?? 0) >= 150,
      "/dashboard/profile",
    ),
    item("logo", "Upload a logo", 8, Boolean(input.logoUrl), "/dashboard/profile"),
    item("cover", "Add a cover image", 4, Boolean(input.coverImageUrl), "/dashboard/profile"),
    item("gstin", "Add your GSTIN", 8, Boolean(input.gstin), "/dashboard/profile"),
    item(
      "company_facts",
      "Add year established, team size and turnover",
      6,
      Boolean(input.establishedYear && input.employeeCount && input.annualTurnover),
      "/dashboard/profile",
    ),
    item(
      "certifications",
      "List your certifications",
      4,
      input.certifications.length > 0,
      "/dashboard/profile",
    ),
    item(
      "products",
      "Publish your first product",
      10,
      input.publishedProducts >= 1,
      "/dashboard/products/new",
    ),
    item("gallery", "Add photos to your gallery", 4, input.galleryItems >= 1, "/dashboard/gallery"),
    item("website", "Publish your website", 4, input.websitePublished, "/dashboard/website"),
  ];

  const total = items.reduce((sum, i) => sum + i.weight, 0);
  const earned = items.filter((i) => i.done).reduce((sum, i) => sum + i.weight, 0);
  const score = Math.round((earned / total) * 100);

  const next = items
    .filter((i) => !i.done)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3);

  return { score, items, next };
}

function item(
  key: string,
  label: string,
  weight: number,
  done: boolean,
  href: string,
): CompletionItem {
  return { key, label, weight, done, href };
}
