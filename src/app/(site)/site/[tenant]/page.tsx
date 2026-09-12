import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPageContext } from "@/lib/tenant/page-context";
import { getHomeContent } from "@/server/services/site-content.service";
import { getTemplate } from "@/components/site/templates/registry";
import { tenantPageMetadata, notFoundMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/seo/JsonLd";
import { sellerJsonLd } from "@/lib/seo/jsonld";

/**
 * Microsite home page.
 *
 * The page's only jobs are to load data and hand it to the seller's chosen
 * template. All rendering lives in reusable template components — that
 * separation is what lets one codebase serve every seller.
 */

type Props = { params: Promise<{ tenant: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenant } = await params;
  const context = await loadPageContext(tenant);
  if (!context) return notFoundMetadata;

  const { seller, website } = context;

  return tenantPageMetadata(context, {
    title:
      website.metaTitle ?? `${seller.businessName}${seller.tagline ? ` — ${seller.tagline}` : ""}`,
    path: "/",
  });
}

export default async function SiteHomePage({ params }: Props) {
  const { tenant } = await params;
  const context = await loadPageContext(tenant);
  if (!context) notFound();

  const data = await getHomeContent(context.seller.id, context.seller.slug);
  const Template = getTemplate(context.website.templateKey);

  return (
    <>
      {/* LocalBusiness markup goes on the home page only. Repeating the same
          @id on every page adds nothing and risks conflicting signals. */}
      <JsonLd data={sellerJsonLd(context.seller, context.urls.base)} />
      <Template.Home context={context} data={data} />
    </>
  );
}
