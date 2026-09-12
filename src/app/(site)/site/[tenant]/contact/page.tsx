import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPageContext } from "@/lib/tenant/page-context";
import { getTemplate } from "@/components/site/templates/registry";
import { tenantPageMetadata, notFoundMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd } from "@/lib/seo/jsonld";

type Props = { params: Promise<{ tenant: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenant } = await params;
  const context = await loadPageContext(tenant);
  if (!context) return notFoundMetadata;

  const { seller } = context;
  const locality = [seller.address.city, seller.address.state].filter(Boolean).join(", ");

  return tenantPageMetadata(context, {
    title: `Contact ${seller.businessName}`,
    description: locality
      ? `Phone, WhatsApp and address for ${seller.businessName} in ${locality}.`
      : `Phone, WhatsApp and address for ${seller.businessName}.`,
    path: "/contact",
  });
}

export default async function ContactPage({ params }: Props) {
  const { tenant } = await params;
  const context = await loadPageContext(tenant);
  if (!context) notFound();

  const Template = getTemplate(context.website.templateKey);

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd(
          [
            { href: "/", label: "Home" },
            { href: "/contact", label: "Contact" },
          ],
          context.urls.base,
        )}
      />
      <Template.Contact context={context} />
    </>
  );
}
