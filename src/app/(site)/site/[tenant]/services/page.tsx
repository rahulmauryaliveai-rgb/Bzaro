import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPageContext } from "@/lib/tenant/page-context";
import { listServices } from "@/server/services/site-content.service";
import { getTemplate } from "@/components/site/templates/registry";
import { tenantPageMetadata, notFoundMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd, itemListJsonLd } from "@/lib/seo/jsonld";

type Props = { params: Promise<{ tenant: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenant } = await params;
  const context = await loadPageContext(tenant);
  if (!context) return notFoundMetadata;

  return tenantPageMetadata(context, {
    title: `Services | ${context.seller.businessName}`,
    description: `Services offered by ${context.seller.businessName}.`,
    path: "/services",
  });
}

export default async function ServicesPage({ params }: Props) {
  const { tenant } = await params;
  const context = await loadPageContext(tenant);
  if (!context) notFound();

  const data = await listServices(context.seller.id, context.seller.slug);
  const Template = getTemplate(context.website.templateKey);

  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd(
            [
              { href: "/", label: "Home" },
              { href: "/services", label: "Services" },
            ],
            context.urls.base,
          ),
          itemListJsonLd(
            data.items.map((service) => ({
              name: service.name,
              href: `/services/${service.slug}`,
            })),
            context.urls.base,
          ),
        ]}
      />
      <Template.Services context={context} data={data} />
    </>
  );
}
