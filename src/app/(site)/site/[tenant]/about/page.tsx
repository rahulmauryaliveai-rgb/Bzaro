import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPageContext } from "@/lib/tenant/page-context";
import { getContentCounts } from "@/server/services/site-content.service";
import { getTemplate } from "@/components/site/templates/registry";
import { tenantPageMetadata, notFoundMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd } from "@/lib/seo/jsonld";

type Props = { params: Promise<{ tenant: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenant } = await params;
  const context = await loadPageContext(tenant);
  if (!context) return notFoundMetadata;

  return tenantPageMetadata(context, {
    title: `About ${context.seller.businessName}`,
    description: context.seller.description?.slice(0, 160),
    path: "/about",
  });
}

export default async function AboutPage({ params }: Props) {
  const { tenant } = await params;
  const context = await loadPageContext(tenant);
  if (!context) notFound();

  const counts = await getContentCounts(context.seller.id, context.seller.slug);
  const Template = getTemplate(context.website.templateKey);

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd(
          [
            { href: "/", label: "Home" },
            { href: "/about", label: "About" },
          ],
          context.urls.base,
        )}
      />
      <Template.About context={context} data={{ counts }} />
    </>
  );
}
