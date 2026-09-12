import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPageContext } from "@/lib/tenant/page-context";
import { listGallery } from "@/server/services/site-content.service";
import { getTemplate } from "@/components/site/templates/registry";
import { tenantPageMetadata, notFoundMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd } from "@/lib/seo/jsonld";

type Props = { params: Promise<{ tenant: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenant } = await params;
  const context = await loadPageContext(tenant);
  if (!context) return notFoundMetadata;

  const items = await listGallery(context.seller.id, context.seller.slug);

  return tenantPageMetadata(context, {
    title: `Gallery | ${context.seller.businessName}`,
    description: `Photos from ${context.seller.businessName}.`,
    path: "/gallery",
    image: items[0]?.url,
    // An empty gallery is a thin page. Keep it reachable for visitors but out
    // of the index — it would otherwise dilute the site's aggregate quality.
    noindex: items.length === 0,
  });
}

export default async function GalleryPage({ params }: Props) {
  const { tenant } = await params;
  const context = await loadPageContext(tenant);
  if (!context) notFound();

  const items = await listGallery(context.seller.id, context.seller.slug);
  const Template = getTemplate(context.website.templateKey);

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd(
          [
            { href: "/", label: "Home" },
            { href: "/gallery", label: "Gallery" },
          ],
          context.urls.base,
        )}
      />
      <Template.Gallery context={context} data={{ items }} />
    </>
  );
}
