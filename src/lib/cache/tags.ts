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
} as const;

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
