import type { Metadata } from "next";
import { search } from "@/lib/search";
import { parseSearchParams, RESULTS_PER_PAGE } from "@/lib/validation/search";
import { categoryIdFromPath, locationIdFromPath } from "@/server/services/taxonomy.service";
import { SearchBar } from "@/components/marketplace/SearchBar";
import { SortSelect } from "@/components/marketplace/SortSelect";
import { FilterPanel } from "@/components/marketplace/FilterPanel";
import { ProductResultCard } from "@/components/marketplace/ResultCards";
import { ResultsPagination } from "@/components/marketplace/ResultsPagination";
import { marketplaceUrl } from "@/lib/utils/url";
import { clientEnv } from "@/env.client";

/**
 * Product directory.
 *
 * The same engine as /search, presented as a browsable catalogue rather than a
 * query-first surface — it is the landing page for "show me everything" and the
 * fallback when a search finds nothing.
 */

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const query = parseSearchParams(await searchParams);
  const platform = clientEnv.NEXT_PUBLIC_PLATFORM_NAME;

  return {
    title: "All products",
    description: `Browse products from verified suppliers on ${platform}.`,
    alternates: { canonical: marketplaceUrl("/products") },
    robots: query.page > 5 ? { index: false, follow: true } : { index: true, follow: true },
  };
}

export default async function ProductsDirectoryPage({ searchParams }: Props) {
  const query = parseSearchParams(await searchParams);

  const [categoryId, locationId] = await Promise.all([
    categoryIdFromPath(query.category),
    locationIdFromPath(query.location),
  ]);

  const input = {
    query: query.q,
    categoryId,
    locationId,
    minPriceMinor: query.minPrice !== undefined ? query.minPrice * 100 : undefined,
    maxPriceMinor: query.maxPrice !== undefined ? query.maxPrice * 100 : undefined,
    pricedOnly: query.pricedOnly,
    verifiedOnly: query.verifiedOnly,
    sort: query.sort,
    page: query.page,
    perPage: RESULTS_PER_PAGE,
  };

  const [results, facets] = await Promise.all([search.searchProducts(input), search.facets(input)]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Products</h1>
        <p className="mt-2 text-neutral-600">
          <span className="tabular-nums">{results.total}</span> listing
          {results.total === 1 ? "" : "s"} from verified suppliers
        </p>
      </header>

      <SearchBar defaultQuery={query.q} action="/products" />

      <div className="mt-8 grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <FilterPanel params={query} facets={facets} basePath="/products" />

        <div className="min-w-0">
          <div className="mb-5 flex justify-end">
            <SortSelect value={query.sort} action="/products" />
          </div>

          {results.total === 0 ? (
            <div className="rounded-lg border border-dashed border-neutral-300 p-12 text-center">
              <p className="font-medium">No products matched</p>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {results.hits.map((hit) => (
                <ProductResultCard key={hit.id} hit={hit} />
              ))}
            </div>
          )}

          <ResultsPagination params={query} pageCount={results.pageCount} basePath="/products" />
        </div>
      </div>
    </div>
  );
}
