import type { Metadata } from "next";
import { search } from "@/lib/search";
import { parseSearchParams, RESULTS_PER_PAGE } from "@/lib/validation/search";
import { categoryIdFromPath, locationIdFromPath } from "@/server/services/taxonomy.service";
import { SearchBar } from "@/components/marketplace/SearchBar";
import { SellerResultCard } from "@/components/marketplace/ResultCards";
import {
  MarketplaceBreadcrumbs,
  ResultsPagination,
} from "@/components/marketplace/ResultsPagination";
import { marketplaceUrl } from "@/lib/utils/url";
import { clientEnv } from "@/env.client";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd } from "@/lib/seo/jsonld";

const TRAIL = [
  { href: "/", label: "Home" },
  { href: "/sellers", label: "Suppliers" },
];

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const query = parseSearchParams(await searchParams);
  const platform = clientEnv.NEXT_PUBLIC_PLATFORM_NAME;

  return {
    title: "Supplier directory",
    description: `Browse verified suppliers, manufacturers and service providers on ${platform}.`,
    alternates: { canonical: marketplaceUrl("/sellers") },
    // Filtered and deep-paginated variants consolidate on the plain directory
    // (canonical above) and stay out of the index themselves (D44).
    robots:
      query.page > 5 || query.q || query.category || query.location
        ? { index: false, follow: true }
        : { index: true, follow: true },
  };
}

export default async function SellersPage({ searchParams }: Props) {
  const query = parseSearchParams(await searchParams);

  const [categoryId, locationId] = await Promise.all([
    categoryIdFromPath(query.category),
    locationIdFromPath(query.location),
  ]);

  const results = await search.searchSellers({
    query: query.q,
    categoryId,
    locationId,
    verifiedOnly: query.verifiedOnly,
    sort: query.sort,
    page: query.page,
    perPage: RESULTS_PER_PAGE,
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <JsonLd data={breadcrumbJsonLd(TRAIL, marketplaceUrl())} />
      <MarketplaceBreadcrumbs trail={TRAIL} />
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Suppliers</h1>
        <p className="mt-2 text-neutral-600">
          <span className="tabular-nums">{results.total}</span> verified business
          {results.total === 1 ? "" : "es"}
        </p>
      </header>

      <div className="mb-8">
        <SearchBar
          defaultQuery={query.q}
          action="/sellers"
          placeholder="Search suppliers by name…"
        />
      </div>

      {results.total === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 p-12 text-center">
          <p className="font-medium">No suppliers matched</p>
          <p className="mt-1 text-sm text-neutral-600">Try a different name or browse by city.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {results.hits.map((hit) => (
            <SellerResultCard key={hit.id} hit={hit} />
          ))}
        </div>
      )}

      <ResultsPagination params={query} pageCount={results.pageCount} basePath="/sellers" />
    </div>
  );
}
