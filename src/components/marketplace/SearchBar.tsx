/**
 * The marketplace search box.
 *
 * A plain GET form, not a client component. That is deliberate:
 *
 *   - it works before JavaScript loads, and keeps working if it never does
 *   - the browser handles history, back button and bookmarking for free
 *   - every search produces a real, shareable, crawlable URL
 *
 * A JS-driven search that writes to `history.pushState` gives up all three for
 * a marginal latency win on a page that is already server-rendered.
 *
 * Current filters ride along as hidden inputs, so submitting a new query keeps
 * the category and location the user already chose — losing filters on every
 * search is the fastest way to make a search feel hostile.
 */

export function SearchBar({
  defaultQuery,
  hidden = {},
  action = "/search",
  placeholder = "Search products, suppliers, services…",
}: {
  defaultQuery?: string;
  hidden?: Record<string, string | undefined>;
  action?: string;
  placeholder?: string;
}) {
  return (
    <form action={action} method="get" role="search" className="flex w-full gap-2">
      {Object.entries(hidden).map(([name, value]) =>
        value ? <input key={name} type="hidden" name={name} value={value} /> : null,
      )}

      <label htmlFor="marketplace-search" className="sr-only">
        Search
      </label>

      <input
        id="marketplace-search"
        type="search"
        name="q"
        defaultValue={defaultQuery}
        placeholder={placeholder}
        // Matches the Zod cap, so the browser rejects oversized input before it
        // becomes a round trip.
        maxLength={120}
        autoComplete="off"
        className="min-w-0 flex-1 rounded-md border border-neutral-300 bg-white px-4 py-2.5 text-base outline-none focus-visible:border-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-900/10"
      />

      <button
        type="submit"
        className="shrink-0 rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700"
      >
        Search
      </button>
    </form>
  );
}
