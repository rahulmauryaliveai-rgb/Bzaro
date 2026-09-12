import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPageContext } from "@/lib/tenant/page-context";
import { getService } from "@/server/services/site-content.service";
import { getTemplate } from "@/components/site/templates/registry";
import { tenantPageMetadata, notFoundMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd, serviceJsonLd } from "@/lib/seo/jsonld";

type Props = { params: Promise<{ tenant: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenant, slug } = await params;
  const context = await loadPageContext(tenant);
  if (!context) return notFoundMetadata;

  const service = await getService(context.seller.id, context.seller.slug, slug);
  if (!service) return notFoundMetadata;

  return tenantPageMetadata(context, {
    title: service.metaTitle ?? `${service.name} | ${context.seller.businessName}`,
    description:
      service.metaDescription ?? service.shortDescription ?? service.description?.slice(0, 160),
    path: `/services/${service.slug}`,
    image: service.imageUrl,
  });
}

export default async function ServiceDetailPage({ params }: Props) {
  const { tenant, slug } = await params;
  const context = await loadPageContext(tenant);
  if (!context) notFound();

  const service = await getService(context.seller.id, context.seller.slug, slug);
  if (!service) notFound();

  const Template = getTemplate(context.website.templateKey);
  const url = `${context.urls.base}/services/${service.slug}`;

  return (
    <>
      <JsonLd
        data={[
          serviceJsonLd({
            service,
            url,
            sellerName: context.seller.businessName,
            baseUrl: context.urls.base,
          }),
          breadcrumbJsonLd(
            [
              { href: "/", label: "Home" },
              { href: "/services", label: "Services" },
              { href: `/services/${service.slug}`, label: service.name },
            ],
            context.urls.base,
          ),
        ]}
      />
      <Template.ServiceDetail context={context} data={{ service }} />
    </>
  );
}
