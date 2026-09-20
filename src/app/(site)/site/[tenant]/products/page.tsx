import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPageContext } from "@/lib/tenant/page-context";
import { getSiteCategories, listProducts } from "@/server/services/site-content.service";
import { getTemplate } from "@/components/site/templates/registry";
import { tenantPageMetadata, notFoundMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd, itemListJsonLd } from "@/lib/seo/jsonld";

type Props = {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ page?: string; q?: string; category?: string }>;
};

function parsePage(value: string | undefined): number {
  const n = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ tenant }, query] = await Promise.all([params, searchParams]);
  const context = await loadPageContext(tenant);
  if (!context) return notFoundMetadata;

  const page = parsePage(query.page);
  const suffix = page > 1 ? ` — page ${page}` : "";

  return tenantPageMetadata(context, {
    title: `Products${suffix} | ${context.seller.businessName}`,
    description: `Browse products supplied by ${context.seller.businessName}.`,
    // Canonical always points at page 1's URL space without the query string,
    // and deep pages are dropped from the index entirely — paginated listings
    // are crawl-budget waste that competes with the product pages themselves.
    path: "/products",
    // Search results and filtered views are unbounded URL spaces; only the
    // plain listing is worth indexing.
    noindex: page > 5 || Boolean(query.q) || Boolean(query.category),
  });
}

export default async function ProductsPage({ params, searchParams }: Props) {
  const [{ tenant }, query] = await Promise.all([params, searchParams]);
  const context = await loadPageContext(tenant);
  if (!context) notFound();

  const [listing, categories] = await Promise.all([
    listProducts(context.seller.id, context.seller.slug, parsePage(query.page), {
      q: query.q,
      category: query.category,
    }),
    getSiteCategories(context.seller.id, context.seller.slug),
  ]);
  const data = { ...listing, categories };
  const Template = getTemplate(context.website.templateKey);

  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd(
            [
              { href: "/", label: "Home" },
              { href: "/products", label: "Products" },
            ],
            context.urls.base,
          ),
          itemListJsonLd(
            data.items.map((product) => ({
              name: product.name,
              href: `/products/${product.slug}`,
            })),
            context.urls.base,
          ),
        ]}
      />
      <Template.Products context={context} data={data} />
    </>
  );
}
