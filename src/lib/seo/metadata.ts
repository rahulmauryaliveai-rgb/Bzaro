import type { Metadata } from "next";
import type { TenantContext } from "@/lib/tenant/context";
import { canonical } from "@/lib/utils/url";

/**
 * Metadata for microsite pages.
 *
 * One helper so every page on every seller site gets the same treatment:
 * canonical URL, robots driven by the eligibility gate, Open Graph and Twitter
 * cards. Hand-rolling these per page is how a platform ends up with half its
 * pages missing canonicals and nobody noticing for a year.
 */

export function tenantPageMetadata(
  context: TenantContext,
  page: {
    title: string;
    description?: string | null;
    path: string;
    image?: string | null;
    /** Set for pages that should never be indexed regardless of the gate. */
    noindex?: boolean;
  },
): Metadata {
  const { seller, website, urls } = context;

  const description =
    page.description?.slice(0, 300) ??
    website.metaDescription ??
    seller.description?.slice(0, 160) ??
    `${seller.businessName} — products, services and contact details.`;

  const image = page.image ?? website.ogImageUrl ?? seller.coverImageUrl ?? seller.logoUrl;
  const url = canonical(urls.base, page.path);

  /**
   * Decision D2, enforced on every page.
   *
   * `follow` rather than `nofollow` while blocked: we still want crawlers to
   * traverse links out of the page, we just don't want this page in the index
   * until the seller's profile is substantial enough to deserve it.
   */
  const indexable = website.indexable && !page.noindex;

  return {
    title: page.title,
    description,
    alternates: { canonical: url },
    robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: {
      type: "website",
      siteName: seller.businessName,
      title: page.title,
      description,
      url,
      ...(image ? { images: [image] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: page.title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

/** Metadata for a page whose tenant could not be resolved. */
export const notFoundMetadata: Metadata = {
  title: "Not found",
  robots: { index: false, follow: false },
};
