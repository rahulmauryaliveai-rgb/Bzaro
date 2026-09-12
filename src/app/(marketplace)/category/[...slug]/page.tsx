import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { search } from "@/lib/search";
import { parseSearchParams, RESULTS_PER_PAGE, buildSearchQuery } from "@/lib/validation/search";
import {
  getCategoryAncestors,
  getCategoryByPath,
  getCategoryChildren,
  locationIdFromPath,
} from "@/server/services/taxonomy.service";
import { ProductResultCard } from "@/components/marketplace/ResultCards";
import {
  MarketplaceBreadcrumbs,
  ResultsPagination,
} from "@/components/marketplace/ResultsPagination";
import { SortSelect } from "@/components/marketplace/SortSelect";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd, itemListJsonLd } from "@/lib/seo/jsonld";
import { marketplaceUrl } from "@/lib/utils/url";
import { clientEnv } from "@/env.client";

/**
 * Category pages.
 *
 * These are the marketplace's ranking surface (decision D1): the marketplace is
 * canonical for aggregate discovery, and "LED panel suppliers" is exactly the
 * kind of query a category page should own rather than a filtered search URL.
 *
 * Which is why search permutations are `noindex` while these are not — they are
 * stable, curated, editorially describable, and there is one per real category
 * rather than one per filter combination.
 */

type Props = {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, rawQuery] = await Promise.all([params, searchParams]);
  const category = await getCategoryByPath(slug);

  if (!category) return { title: "Category not found", robots: { index: false, follow: false } };

  const query = parseSearchParams(rawQuery);
  const platform = clientEnv.NEXT_PUBLIC_PLATFORM_NAME;
  const path = `/category/${slug.join("/")}`;

  return {
    title: category.metaTitle ?? `${category.name} suppliers and manufacturers`,
    description:
      category.metaDescription ??
      category.description ??
      `Find verified ${category.name.toLowerCase()} suppliers on ${platform}. Compare products, prices and contact suppliers directly.`,
    // Canonical drops pagination and filters so page 2 does not compete with
    // page 1 for the same term.
    alternates: { canonical: marketplaceUrl(path) },
    robots: query.page > 5 ? { index: false, follow: true } : { index: true, follow: true },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const [{ slug }, rawQuery] = await Promise.all([params, searchParams]);
  const category = await getCategoryByPath(slug);

  if (!category) notFound();

  const query = parseSearchParams(rawQuery);
  const locationId = await locationIdFromPath(query.location);

  const [ancestors, children, results] = await Promise.all([
    getCategoryAncestors(category.ancestorIds),
    getCategoryChildren(category.id),
    search.searchProducts({
      categoryId: category.id,
      locationId,
      query: query.q,
      minPriceMinor: query.minPrice !== undefined ? query.minPrice * 100 : undefined,
      maxPriceMinor: query.maxPrice !== undefined ? query.maxPrice * 100 : undefined,
      pricedOnly: query.pricedOnly,
      verifiedOnly: query.verifiedOnly,
      sort: query.sort,
      page: query.page,
      perPage: RESULTS_PER_PAGE,
    }),
  ]);

  const basePath = `/category/${slug.join("/")}`;

  const trail = [
    { href: "/", label: "Home" },
    ...ancestors.map((node) => ({ href: `/category${node.path}`, label: node.name })),
    { href: basePath, label: category.name },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <JsonLd
        data={[
          breadcrumbJsonLd(trail, marketplaceUrl()),
          itemListJsonLd(
            results.hits.map((hit) => ({
              name: hit.name,
              href: `/product/${hit.sellerSlug}/${hit.slug}`,
            })),
            marketplaceUrl(),
          ),
        ]}
      />

      <MarketplaceBreadcrumbs trail={trail} />

      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-balance">{category.name}</h1>
        <p className="mt-2 text-neutral-600">
          <span className="tabular-nums">{results.total}</span> product
          {results.total === 1 ? "" : "s"} from verified suppliers
        </p>
        {category.description ? (
          <p className="mt-3 max-w-2xl leading-relaxed text-neutral-700">{category.description}</p>
        ) : null}
      </header>

      {/* Subcategories come before results: a buyer who landed on "Lighting"
          usually wants to narrow before they browse 400 items. */}
      {children.length > 0 ? (
        <nav aria-label="Subcategories" className="mb-8">
          <ul className="flex flex-wrap gap-2">
            {children.map((child) => (
              <li key={child.id}>
                <Link
                  href={`/category${child.path}`}
                  className="inline-block rounded-full border border-neutral-300 px-3.5 py-1.5 text-sm hover:bg-neutral-50"
                >
                  {child.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/search${buildSearchQuery({ category: slug.join("/") })}`}
          className="text-sm text-neutral-600 underline underline-offset-2 hover:text-neutral-900"
        >
          Refine with filters
        </Link>
        <SortSelect value={query.sort} action={basePath} />
      </div>

      {results.total === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 p-12 text-center">
          <p className="font-medium">No products listed in this category yet</p>
          <Link
            href="/search"
            className="mt-4 inline-block rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
          >
            Browse everything
          </Link>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {results.hits.map((hit) => (
            <ProductResultCard key={hit.id} hit={hit} />
          ))}
        </div>
      )}

      <ResultsPagination params={query} pageCount={results.pageCount} basePath={basePath} />
    </div>
  );
}
