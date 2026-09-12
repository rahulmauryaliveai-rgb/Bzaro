import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPageContext } from "@/lib/tenant/page-context";
import { getProduct, listRelatedProducts } from "@/server/services/site-content.service";
import { getTemplate } from "@/components/site/templates/registry";
import { tenantPageMetadata, notFoundMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd, productJsonLd } from "@/lib/seo/jsonld";

/**
 * Product detail — the canonical home for this product (decision D1).
 *
 * The marketplace's copy of this page carries `rel="canonical"` pointing here,
 * so this URL is the one that accumulates ranking. That is the seller's actual
 * return on having a microsite.
 */

type Props = { params: Promise<{ tenant: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenant, slug } = await params;
  const context = await loadPageContext(tenant);
  if (!context) return notFoundMetadata;

  const product = await getProduct(context.seller.id, context.seller.slug, slug);
  if (!product) return notFoundMetadata;

  return tenantPageMetadata(context, {
    title: product.metaTitle ?? `${product.name} | ${context.seller.businessName}`,
    description:
      product.metaDescription ?? product.shortDescription ?? product.description?.slice(0, 160),
    path: `/products/${product.slug}`,
    image: product.images[0]?.url,
  });
}

export default async function ProductDetailPage({ params }: Props) {
  const { tenant, slug } = await params;
  const context = await loadPageContext(tenant);
  if (!context) notFound();

  const product = await getProduct(context.seller.id, context.seller.slug, slug);
  if (!product) notFound();

  const related = await listRelatedProducts(context.seller.id, context.seller.slug, product.id);
  const Template = getTemplate(context.website.templateKey);
  const url = `${context.urls.base}/products/${product.slug}`;

  return (
    <>
      <JsonLd
        data={[
          productJsonLd({ product, url, sellerName: context.seller.businessName }),
          breadcrumbJsonLd(
            [
              { href: "/", label: "Home" },
              { href: "/products", label: "Products" },
              { href: `/products/${product.slug}`, label: product.name },
            ],
            context.urls.base,
          ),
        ]}
      />
      <Template.ProductDetail context={context} data={{ product, related }} />
    </>
  );
}
