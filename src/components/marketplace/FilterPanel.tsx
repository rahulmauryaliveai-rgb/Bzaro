import Link from "next/link";
import type { SearchFacets } from "@/lib/search/types";
import { buildSearchQuery, hasActiveFilters, type SearchParams } from "@/lib/validation/search";

/**
 * Faceted filter panel.
 *
 * Every filter is a LINK, not a checkbox posting to an endpoint. That choice
 * carries most of the SEO and usability weight on this page:
 *
 *   - each filter combination has a real URL, so it is shareable and crawlable
 *   - back/forward work without any history management
 *   - it functions with no JavaScript at all
 *
 * Counts come from the facet query, which excludes each facet's own filter — so
 * the panel can be used to widen a search, not just narrow it. A panel that
 * only ever shows the selected value with the full count is decorative.
 *
 * Facets with a zero count are never rendered: a dead end that promises results
 * is worse than an absent option.
 */

export function FilterPanel({
  params,
  facets,
  basePath = "/search",
}: {
  params: SearchParams;
  facets: SearchFacets;
  basePath?: string;
}) {
  const active = hasActiveFilters(params);

  return (
    <aside className="space-y-7" aria-label="Filters">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-neutral-900 uppercase">Filters</h2>
        {active ? (
          <Link
            href={`${basePath}${buildSearchQuery({ q: params.q, mode: params.mode })}`}
            className="text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-900"
          >
            Clear all
          </Link>
        ) : null}
      </div>

      <FacetGroup
        title="Category"
        options={facets.categories}
        selected={params.category}
        params={params}
        basePath={basePath}
        paramName="category"
      />

      <FacetGroup
        title="Location"
        options={facets.locations}
        selected={params.location}
        params={params}
        basePath={basePath}
        paramName="location"
      />

      <PriceFilter params={params} basePath={basePath} />

      <div className="space-y-2 border-t border-neutral-200 pt-5">
        <ToggleFilter
          label="Verified suppliers only"
          checked={params.verifiedOnly}
          params={params}
          basePath={basePath}
          paramName="verifiedOnly"
        />
        <ToggleFilter
          label="Hide price on request"
          checked={params.pricedOnly}
          params={params}
          basePath={basePath}
          paramName="pricedOnly"
        />
      </div>
    </aside>
  );
}

function FacetGroup({
  title,
  options,
  selected,
  params,
  basePath,
  paramName,
}: {
  title: string;
  options: SearchFacets["categories"];
  selected: string | undefined;
  params: SearchParams;
  basePath: string;
  paramName: "category" | "location";
}) {
  const visible = options.filter((option) => option.count > 0);
  if (visible.length === 0 && !selected) return null;

  return (
    <div className="border-t border-neutral-200 pt-5">
      <h3 className="mb-3 text-sm font-medium text-neutral-900">{title}</h3>
      <ul className="space-y-1.5">
        {selected ? (
          <li>
            <Link
              // Selecting again clears — the same control both applies and
              // removes, which is what users expect from a filter list.
              href={`${basePath}${buildSearchQuery(params, { [paramName]: undefined, page: 1 } as Partial<SearchParams>)}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-900"
            >
              <span aria-hidden="true">✕</span>
              {labelForPath(selected)}
            </Link>
          </li>
        ) : null}

        {visible
          .filter((option) => option.value !== selected)
          .map((option) => (
            <li key={option.value}>
              <Link
                href={`${basePath}${buildSearchQuery(params, { [paramName]: normalisePath(option.value), page: 1 } as Partial<SearchParams>)}`}
                className="flex items-baseline justify-between gap-3 text-sm text-neutral-600 hover:text-neutral-900"
              >
                <span className="min-w-0 truncate">{option.label}</span>
                <span className="shrink-0 text-xs text-neutral-400 tabular-nums">
                  {option.count}
                </span>
              </Link>
            </li>
          ))}
      </ul>
    </div>
  );
}

/**
 * Price range.
 *
 * A GET form rather than preset buckets: B2B price ranges span four orders of
 * magnitude across categories, so fixed buckets are wrong for almost every
 * search. Values are in rupees, converted to paise server-side.
 */
function PriceFilter({ params, basePath }: { params: SearchParams; basePath: string }) {
  return (
    <form action={basePath} method="get" className="border-t border-neutral-200 pt-5">
      {(["q", "category", "location", "sort", "mode"] as const).map((key) => {
        const value = params[key];
        return value && value !== "products" && value !== "relevance" ? (
          <input key={key} type="hidden" name={key} value={String(value)} />
        ) : null;
      })}
      {params.verifiedOnly ? <input type="hidden" name="verifiedOnly" value="1" /> : null}
      {params.pricedOnly ? <input type="hidden" name="pricedOnly" value="1" /> : null}

      <h3 className="mb-3 text-sm font-medium text-neutral-900">Price (₹)</h3>

      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor="minPrice">
          Minimum price
        </label>
        <input
          id="minPrice"
          type="number"
          name="minPrice"
          min={0}
          inputMode="numeric"
          placeholder="Min"
          defaultValue={params.minPrice ?? ""}
          className="w-full min-w-0 rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm"
        />
        <span className="text-neutral-400">–</span>
        <label className="sr-only" htmlFor="maxPrice">
          Maximum price
        </label>
        <input
          id="maxPrice"
          type="number"
          name="maxPrice"
          min={0}
          inputMode="numeric"
          placeholder="Max"
          defaultValue={params.maxPrice ?? ""}
          className="w-full min-w-0 rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm"
        />
      </div>

      <button
        type="submit"
        className="mt-3 w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50"
      >
        Apply price
      </button>
    </form>
  );
}

function ToggleFilter({
  label,
  checked,
  params,
  basePath,
  paramName,
}: {
  label: string;
  checked: boolean;
  params: SearchParams;
  basePath: string;
  paramName: "verifiedOnly" | "pricedOnly";
}) {
  const href = `${basePath}${buildSearchQuery(params, {
    [paramName]: !checked,
    page: 1,
  } as Partial<SearchParams>)}`;

  return (
    <Link href={href} className="flex items-center gap-2.5 text-sm text-neutral-700">
      <span
        aria-hidden="true"
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
          checked ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white"
        }`}
      >
        {checked ? "✓" : ""}
      </span>
      <span>{label}</span>
      <span className="sr-only">{checked ? "(active, select to remove)" : ""}</span>
    </Link>
  );
}

/** `/electronics/lighting` → `electronics/lighting` for the query string. */
function normalisePath(path: string): string {
  return path.replace(/^\/+/, "");
}

/** Last segment of a path, title-cased — a readable label for a raw path. */
function labelForPath(path: string): string {
  const last =
    path
      .replace(/^\/+|\/+$/g, "")
      .split("/")
      .pop() ?? path;
  return last.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
