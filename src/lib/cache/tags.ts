/**
 * The cache-tag vocabulary.
 *
 * One module owns every tag string in the application. Tags built ad hoc drift
 * ("tenant:abc" vs "seller:abc") and the drift is invisible: nothing errors, a
 * revalidation simply never fires and a seller stares at a stale page while
 * support insists the edit saved.
 *
 * Rule: a mutation revalidates its tags in the same function that performs the
 * write, inside the service layer. Never leave revalidation to a page or a
 * caller to remember.
 */

export const cacheTags = {
  /** Seller profile, website settings, theme. */
  tenant: (slug: string) => `tenant:${slug}`,
  /** A tenant's product collection — list pages and counts. */
  tenantProducts: (slug: string) => `tenant:${slug}:products`,
  /** A tenant's service collection. */
  tenantServices: (slug: string) => `tenant:${slug}:services`,
  /** A tenant's gallery. */
  tenantGallery: (slug: string) => `tenant:${slug}:gallery`,
  /** A single product detail page. */
  product: (id: string) => `product:${id}`,
  /** A single service detail page. */
  service: (id: string) => `service:${id}`,
  /** A category page and its listings. */
  category: (id: string) => `category:${id}`,
  /** A location page and its listings. */
  location: (id: string) => `location:${id}`,
  /** Marketplace homepage: featured and curated content. */
  home: () => "home",
  /** Sitemap shards. */
  sitemap: () => "sitemap",
  /** The category tree, read by nearly every public page. */
  categoryTree: () => "category-tree",
  /** The location tree. */
  locationTree: () => "location-tree",

  // ── Buyer discovery (ISR pages, Phase 5) ──
  // Keyed by ids, not slugs, so a renamed category or city keeps its tag.
  /** Category listing across every city: /category/[slug]. */
  discoveryCategory: (categoryId: string) => `discovery:category:${categoryId}`,
  /** City landing page: /[city]. */
  discoveryCity: (locationId: string) => `discovery:city:${locationId}`,
  /** City × category listing: /[city]/category/[slug]. */
  discoveryCityCategory: (locationId: string, categoryId: string) =>
    `discovery:city:${locationId}:category:${categoryId}`,
  /** "Popular in <city>" block on the homepage. */
  popularInCity: (locationId: string) => `discovery:popular:${locationId}`,
} as const;

/**
 * Every discovery tag a seller can appear under. Called when a seller's
 * status, categories, city or service areas change, or a product is
 * published / unpublished — the listings are ISR pages and would otherwise
 * show the change only after their hour-long revalidate window.
 */
export function discoveryTags(input: { categoryIds: string[]; locationIds: string[] }): string[] {
  const tags = new Set<string>([cacheTags.home()]);
  for (const categoryId of input.categoryIds) {
    tags.add(cacheTags.discoveryCategory(categoryId));
    for (const locationId of input.locationIds) {
      tags.add(cacheTags.discoveryCityCategory(locationId, categoryId));
    }
  }
  for (const locationId of input.locationIds) {
    tags.add(cacheTags.discoveryCity(locationId));
    tags.add(cacheTags.popularInCity(locationId));
  }
  return [...tags];
}

/**
 * Every tag affected when a seller's own profile changes. Products and services
 * are included because the microsite header, footer and contact blocks render
 * seller data on every page.
 */
export function tenantTags(slug: string): string[] {
  return [
    cacheTags.tenant(slug),
    cacheTags.tenantProducts(slug),
    cacheTags.tenantServices(slug),
    cacheTags.tenantGallery(slug),
  ];
}

export type CacheTag = string;
