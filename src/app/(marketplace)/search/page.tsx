import type { Metadata } from "next";
import Link from "next/link";
import { RequirementCard } from "@/components/marketplace/RequirementCard";
import { resolveLocation } from "@/lib/location/cookie";
import { getBuyerSession } from "@/server/services/buyer.service";
import { search } from "@/lib/search";
import {
  buildSearchQuery,
  parseSearchParams,
  RESULTS_PER_PAGE,
  type SearchParams,
} from "@/lib/validation/search";
import { categoryIdFromPath, locationIdFromPath } from "@/server/services/taxonomy.service";
import { SearchBar } from "@/components/marketplace/SearchBar";
import { SortSelect } from "@/components/marketplace/SortSelect";
import { FilterPanel } from "@/components/marketplace/FilterPanel";
import { ProductResultCard, SellerResultCard } from "@/components/marketplace/ResultCards";
import { ResultsPagination } from "@/components/marketplace/ResultsPagination";
import { marketplaceUrl } from "@/lib/utils/url";
import { clientEnv } from "@/env.client";

/**
 * Marketplace search.
 *
 * ── Canonical policy ─────────────────────────────────────────────────────────
 * Search is a discovery surface the marketplace uniquely owns, so it is
 * canonical for itself (decision D1). But filtered permutations are NOT
 * separately valuable: `?q=led&category=x&minPrice=100&sort=price_asc` is one
 * of thousands of equivalent slices of the same catalogue.
 *
 * So: any search carrying filters is `noindex, follow`. Crawlers still traverse
 * to the products, which is what we want indexed, but the permutations never
 * enter the index and never compete with the category pages built to rank.
 *
 * The bare `/search` page is indexable as an entry point.
 */

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = parseSearchParams(await searchParams);
  const platform = clientEnv.NEXT_PUBLIC_PLATFORM_NAME;

  const title = params.q ? `${params.q} — search results` : "Search suppliers and products";

  // Anything narrower than a bare search is a permutation, not a page.
  const isPermutation = Boolean(
    params.q ||
    params.category ||
    params.location ||
    params.minPrice !== undefined ||
    params.maxPrice !== undefined ||
    params.pricedOnly ||
    params.verifiedOnly ||
    params.page > 1,
  );

  return {
    title,
    description: params.q
      ? `Suppliers and products matching "${params.q}" on ${platform}.`
      : `Search verified suppliers, products and services on ${platform}.`,
    // Canonical always points at the bare search page: the permutations are all
    // the same underlying content sliced differently.
    alternates: { canonical: marketplaceUrl("/search") },
    robots: isPermutation ? { index: false, follow: true } : { index: true, follow: true },
  };
}

export default async function SearchPage({ searchParams }: Props) {
  const params = parseSearchParams(await searchParams);

  // A signed-in buyer's saved city outranks the IP guess but not their cookie.
  const buyer = await getBuyerSession();

  // Filter paths arrive as human-readable strings; resolve them to ids. An
  // unknown path resolves to undefined, which widens the search rather than
  // erroring — stale filter links should degrade, not break.
  const [categoryId, explicitLocationId] = await Promise.all([
    categoryIdFromPath(params.category),
    locationIdFromPath(params.location),
  ]);

  /**
   * Fall back to the city the visitor chose (Phase 3).
   *
   * Only when no explicit `location` filter is set and they have not opted out.
   * Safe for SEO: a crawler sends no cookie, so it sees the unnarrowed results,
   * and the canonical already points at the bare /search regardless.
   *
   * `implicitCity` drives the notice below — narrowing results silently is how
   * a buyer concludes the marketplace is empty.
   */
  const implicitCity =
    explicitLocationId || params.everywhere ? null : await resolveLocation(buyer?.locationId);

  const locationId = explicitLocationId ?? implicitCity?.id;

  const input = {
    query: params.q,
    categoryId,
    locationId,
    // Prices are entered in rupees and stored in paise.
    minPriceMinor: params.minPrice !== undefined ? params.minPrice * 100 : undefined,
    maxPriceMinor: params.maxPrice !== undefined ? params.maxPrice * 100 : undefined,
    pricedOnly: params.pricedOnly,
    verifiedOnly: params.verifiedOnly,
    sort: params.sort,
    page: params.page,
    perPage: RESULTS_PER_PAGE,
  };

  const isSellerMode = params.mode === "sellers";

  const [results, facets] = await Promise.all([
    isSellerMode ? search.searchSellers(input) : search.searchProducts(input),
    search.facets(input),
  ]);

  const hiddenFilters = {
    category: params.category,
    location: params.location,
    mode: params.mode === "products" ? undefined : params.mode,
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <SearchBar defaultQuery={params.q} hidden={hiddenFilters} />

      <ModeTabs params={params} />

      <div className="mt-8 grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <FilterPanel params={params} facets={facets} />

        <div className="min-w-0">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-neutral-600" aria-live="polite">
              <span className="font-medium text-neutral-900 tabular-nums">{results.total}</span>{" "}
              {isSellerMode ? "supplier" : "product"}
              {results.total === 1 ? "" : "s"}
              {params.q ? (
                <>
                  {" "}
                  for <span className="font-medium text-neutral-900">{params.q}</span>
                </>
              ) : null}
            </p>

            {!isSellerMode ? <SortSelect value={params.sort} hidden={hiddenFilters} /> : null}
          </div>

          {/* Fuzzy results are labelled. Silently showing loosely-related items
              for a precise part number makes the search look broken rather than
              helpful. */}
          {results.fuzzy ? (
            <p className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
              No exact matches for <strong>{params.q}</strong>. Showing closest results.
            </p>
          ) : null}

          {implicitCity ? (
            <p className="mb-4 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
              Narrowed to <span className="font-medium">{implicitCity.name}</span>.{" "}
              <Link
                href={buildSearchQuery(params, { everywhere: true, page: 1 })}
                className="underline hover:text-neutral-900"
              >
                Search everywhere
              </Link>
            </p>
          ) : null}

          {results.total === 0 ? (
            <NoResults params={params} />
          ) : isSellerMode ? (
            <div className="space-y-4">
              {(results.hits as Awaited<ReturnType<typeof search.searchSellers>>["hits"]).map(
                (hit) => (
                  <SellerResultCard key={hit.id} hit={hit} />
                ),
              )}
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {(results.hits as Awaited<ReturnType<typeof search.searchProducts>>["hits"]).map(
                (hit) => (
                  <ProductResultCard key={hit.id} hit={hit} />
                ),
              )}
            </div>
          )}

          <ResultsPagination params={params} pageCount={results.pageCount} />

          <div className="mt-8">
            <RequirementCard query={params.q} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ModeTabs({ params }: { params: SearchParams }) {
  const tabs = [
    { mode: "products" as const, label: "Products" },
    { mode: "sellers" as const, label: "Suppliers" },
  ];

  return (
    <div className="mt-5 flex gap-1 border-b border-neutral-200">
      {tabs.map((tab) => {
        const active = params.mode === tab.mode;
        return (
          <Link
            key={tab.mode}
            href={`/search${buildSearchQuery(params, { mode: tab.mode, page: 1 })}`}
            aria-current={active ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              active
                ? "border-neutral-900 text-neutral-900"
                : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

/**
 * Empty state.
 *
 * Offers a way forward rather than a dead end, and suggests removing the most
 * likely culprit first — a price bound excludes every price-on-request listing,
 * which in this market is most of the catalogue.
 */
function NoResults({ params }: { params: SearchParams }) {
  const suggestions: Array<{ href: string; label: string }> = [];

  if (params.minPrice !== undefined || params.maxPrice !== undefined) {
    suggestions.push({
      href: `/search${buildSearchQuery(params, { minPrice: undefined, maxPrice: undefined, page: 1 })}`,
      label: "Remove the price filter",
    });
  }
  if (params.category) {
    suggestions.push({
      href: `/search${buildSearchQuery(params, { category: undefined, page: 1 })}`,
      label: "Search all categories",
    });
  }
  if (params.location) {
    suggestions.push({
      href: `/search${buildSearchQuery(params, { location: undefined, page: 1 })}`,
      label: "Search all locations",
    });
  }
  if (params.verifiedOnly) {
    suggestions.push({
      href: `/search${buildSearchQuery(params, { verifiedOnly: false, page: 1 })}`,
      label: "Include unverified suppliers",
    });
  }

  return (
    <div className="rounded-lg border border-dashed border-neutral-300 p-12 text-center">
      <p className="font-medium text-neutral-900">Nothing matched that search</p>
      <p className="mt-1 text-sm text-neutral-600">Try a broader term, or widen your filters.</p>

      {suggestions.length > 0 ? (
        <ul className="mt-5 flex flex-wrap justify-center gap-2">
          {suggestions.map((suggestion) => (
            <li key={suggestion.href}>
              <Link
                href={suggestion.href}
                className="inline-block rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
              >
                {suggestion.label}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
