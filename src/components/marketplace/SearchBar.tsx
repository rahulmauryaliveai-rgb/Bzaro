import { Search } from "lucide-react";

/**
 * The marketplace search box.
 *
 * A plain GET form, not a client component. That is deliberate:
 *   - it works before hydration and without JavaScript at all;
 *   - the resulting URL (/search?q=…&location=…) is shareable and cacheable;
 *   - no state to keep in sync with the URL, because the URL IS the state.
 *
 * `cities` adds a city filter inside the box (the IndiaMART pattern — the
 * city is the first thing a B2B buyer narrows by). It posts the location
 * PATH, which is what /search already accepts.
 */
export function SearchBar({
  defaultQuery,
  defaultLocation,
  hidden = {},
  action = "/search",
  placeholder = "Search products, suppliers, services…",
  cities,
  size = "md",
  id = "marketplace-search",
}: {
  defaultQuery?: string;
  defaultLocation?: string;
  hidden?: Record<string, string | undefined>;
  action?: string;
  placeholder?: string;
  cities?: Array<{ path: string; name: string }>;
  size?: "md" | "lg";
  /** Distinct per instance — the header and the hero may both render one. */
  id?: string;
}) {
  const lg = size === "lg";

  return (
    <form
      action={action}
      method="get"
      role="search"
      className={`flex w-full items-stretch overflow-hidden rounded-xl border bg-white shadow-sm ${
        lg
          ? "border-brand-200 shadow-brand-900/10 focus-within:border-brand-500 focus-within:ring-brand-500/15 focus-within:ring-4"
          : "focus-within:border-brand-500 focus-within:ring-brand-500/15 border-neutral-300 focus-within:ring-2"
      }`}
    >
      {Object.entries(hidden).map(([name, value]) =>
        value ? <input key={name} type="hidden" name={name} value={value} /> : null,
      )}

      {cities && cities.length > 0 ? (
        <>
          <label htmlFor={`${id}-city`} className="sr-only">
            City
          </label>
          <select
            id={`${id}-city`}
            name="location"
            defaultValue={defaultLocation ?? ""}
            className={`max-w-[9.5rem] shrink-0 border-r border-neutral-200 bg-neutral-50 pr-2 pl-3 text-sm text-neutral-700 outline-none ${
              lg ? "py-3.5" : "py-2.5"
            }`}
          >
            <option value="">All India</option>
            {cities.map((city) => (
              <option key={city.path} value={city.path}>
                {city.name}
              </option>
            ))}
          </select>
        </>
      ) : null}

      <label htmlFor={id} className="sr-only">
        Search
      </label>
      <input
        id={id}
        type="search"
        name="q"
        defaultValue={defaultQuery}
        placeholder={placeholder}
        // Matches the Zod cap, so the browser rejects oversized input before it
        // becomes a round trip.
        maxLength={120}
        autoComplete="off"
        className={`min-w-0 flex-1 bg-transparent px-4 text-neutral-900 outline-none placeholder:text-neutral-400 ${
          lg ? "py-3.5 text-base" : "py-2.5 text-sm"
        }`}
      />

      <button
        type="submit"
        className={`bg-brand-700 hover:bg-brand-600 inline-flex shrink-0 items-center gap-2 font-medium text-white transition-colors ${
          lg ? "px-6 text-base" : "px-4 text-sm"
        }`}
      >
        <Search className="h-4 w-4" aria-hidden="true" />
        Search
      </button>
    </form>
  );
}
