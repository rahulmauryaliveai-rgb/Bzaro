import "server-only";
import { cache } from "react";
import { getTenant } from "@/lib/tenant/resolve";
import { withLiveCounts, type TenantContext } from "@/lib/tenant/context";
import { getContentCounts, getSiteCategories } from "@/server/services/site-content.service";

/**
 * Resolve a microsite page's tenant, with navigation reflecting live content.
 *
 * Every microsite page calls this instead of `getTenant()` directly, so the
 * navigation on every page agrees about which sections exist. A "Services" tab
 * that 404s because the denormalised counter drifted is the kind of small
 * wrongness that makes a site feel broken.
 *
 * Both the tenant lookup and the counts are cached — per render by
 * `React.cache`, and across requests by `unstable_cache` — so a page, its
 * layout and its metadata function share one resolution and one count query.
 */
export const loadPageContext = cache(async (param: string): Promise<TenantContext | null> => {
  const context = await getTenant(param);
  if (!context) return null;

  const [counts, categories] = await Promise.all([
    getContentCounts(context.seller.id, context.seller.slug),
    getSiteCategories(context.seller.id, context.seller.slug),
  ]);
  return withLiveCounts(context, counts, categories);
});
