import "server-only";
import { revalidateTag, updateTag } from "next/cache";
import { cacheTags, tenantTags } from "@/lib/cache/tags";

/**
 * Cache invalidation.
 *
 * Next.js 16 offers two primitives, and the difference matters here:
 *
 *   updateTag(tag)              Immediate expiry with read-your-own-writes.
 *                               Server Actions only. This is what a seller
 *                               needs: hit save, reload, see the change. Any
 *                               delay reads as "the site is broken" and
 *                               generates a support ticket.
 *
 *   revalidateTag(tag, profile) Marks stale for background revalidation. Usable
 *                               anywhere, including cron jobs and webhooks,
 *                               which cannot call updateTag.
 *
 * So every helper takes a `mode`. Server Actions use the default; background
 * work passes "background".
 *
 * The rule remains: a mutation revalidates its own tags, in the same function
 * that performs the write. Never leave it to a caller to remember.
 */

export type RevalidateMode = "immediate" | "background";

function apply(tags: string[], mode: RevalidateMode): void {
  for (const tag of tags) {
    if (mode === "immediate") {
      updateTag(tag);
    } else {
      // "max" expires the entry outright rather than merely marking it stale,
      // so a background job cannot leave a seller looking at old content until
      // some later profile window elapses.
      revalidateTag(tag, "max");
    }
  }
}

/** Seller profile, branding, contact details, website settings or theme. */
export function revalidateTenant(slug: string, mode: RevalidateMode = "immediate"): void {
  apply(tenantTags(slug), mode);
}

/** A product was created, updated, published, unpublished or deleted. */
export function revalidateProduct(
  slug: string,
  productId?: string,
  mode: RevalidateMode = "immediate",
): void {
  const tags = [cacheTags.tenant(slug), cacheTags.tenantProducts(slug)];
  if (productId) tags.push(cacheTags.product(productId));
  apply(tags, mode);
}

/** A service changed. */
export function revalidateService(
  slug: string,
  serviceId?: string,
  mode: RevalidateMode = "immediate",
): void {
  const tags = [cacheTags.tenant(slug), cacheTags.tenantServices(slug)];
  if (serviceId) tags.push(cacheTags.service(serviceId));
  apply(tags, mode);
}

/** Gallery items added, reordered or removed. */
export function revalidateGallery(slug: string, mode: RevalidateMode = "immediate"): void {
  apply([cacheTags.tenant(slug), cacheTags.tenantGallery(slug)], mode);
}

/** A category was edited, or its counts shifted. */
export function revalidateCategory(categoryId: string, mode: RevalidateMode = "background"): void {
  apply([cacheTags.category(categoryId), cacheTags.categoryTree()], mode);
}

/** A location was edited. */
export function revalidateLocation(locationId: string, mode: RevalidateMode = "background"): void {
  apply([cacheTags.location(locationId), cacheTags.locationTree()], mode);
}

/** Featured or curated marketplace content changed. */
export function revalidateHome(mode: RevalidateMode = "background"): void {
  apply([cacheTags.home()], mode);
}

/**
 * A seller's indexability flipped (decision D2).
 *
 * Both the microsite (robots headers change) and the sitemap shards (inclusion
 * changes) must rebuild. Defaults to background because this is usually
 * triggered by the nightly recompute job rather than by a seller action.
 */
export function revalidateIndexability(slug: string, mode: RevalidateMode = "background"): void {
  apply([...tenantTags(slug), cacheTags.sitemap()], mode);
}
