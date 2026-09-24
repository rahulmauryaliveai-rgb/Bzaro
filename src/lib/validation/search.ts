import { z } from "zod";

/**
 * Search and filter parameters.
 *
 * ── These arrive from the URL, so they are hostile until proven otherwise ────
 * Every field is capped and coerced. A search page is the most-linked, most
 * crawled, most fuzzed surface on the platform: bots will send `?page=1e9`,
 * `?q=<2MB of text>`, and `?minPrice=-1` on day one.
 *
 * Caps are not paranoia, they are cost control — an uncapped `page` becomes an
 * OFFSET of a billion, which Postgres will happily attempt.
 *
 * Parsing NEVER throws. Bad input degrades to the default rather than 500ing,
 * because a crawler hitting a malformed URL should get a usable page, not an
 * error that ends up in Search Console.
 */

export const SORT_OPTIONS = ["relevance", "newest", "price_asc", "price_desc"] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

export const SEARCH_MODES = ["products", "sellers"] as const;
export type SearchMode = (typeof SEARCH_MODES)[number];

export const RESULTS_PER_PAGE = 24;
/**
 * Deep pagination is capped hard. Beyond this, OFFSET scans stop being cheap
 * and the results stop being useful — nobody browses to page 100, but crawlers
 * will try. Everything past here is reachable through category pages instead.
 */
export const MAX_PAGE = 50;

/** Prices are entered in rupees by humans and stored as paise. */
const MAX_PRICE_MAJOR = 100_000_000;

export const searchParamsSchema = z.object({
  /** Free-text query. */
  q: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),

  mode: z.enum(SEARCH_MODES).catch("products"),

  /** Category path segment, e.g. "electronics/lighting/led-bulbs". */
  category: z.string().trim().max(200).optional(),

  /** Location path segment, e.g. "in/maharashtra/mumbai". */
  location: z.string().trim().max(200).optional(),

  /** Inclusive price bounds in MAJOR units (rupees), as a human would type. */
  minPrice: z.coerce.number().int().min(0).max(MAX_PRICE_MAJOR).optional().catch(undefined),
  maxPrice: z.coerce.number().int().min(0).max(MAX_PRICE_MAJOR).optional().catch(undefined),

  /** Hide "price on request" listings. */
  pricedOnly: z
    .enum(["1", "true"])
    .optional()
    .transform((value) => value !== undefined)
    .catch(false),

  /** Only sellers the platform has verified. */
  verifiedOnly: z
    .enum(["1", "true"])
    .optional()
    .transform((value) => value !== undefined)
    .catch(false),

  /**
   * Opt out of the visitor's remembered city.
   *
   * Without an explicit `location`, search narrows to whatever city the
   * visitor chose (the `bz_loc` cookie). This is the escape hatch, and it has
   * to be explicit: the ABSENCE of `location` cannot mean "everywhere",
   * because that is exactly the case the cookie fills in.
   */
  everywhere: z
    .enum(["1", "true"])
    .optional()
    .transform((value) => value !== undefined)
    .catch(false),

  sort: z.enum(SORT_OPTIONS).catch("relevance"),

  page: z.coerce.number().int().min(1).max(MAX_PAGE).catch(1),
});

export type SearchParams = z.infer<typeof searchParamsSchema>;

/**
 * Parse raw URL search params. Always succeeds.
 *
 * `.catch()` on each field means one malformed parameter degrades that
 * parameter alone rather than discarding the whole query — a user whose
 * `?page=abc` got mangled by a mail client should still see their search.
 */
export function parseSearchParams(
  raw: Record<string, string | string[] | undefined>,
): SearchParams {
  // Repeated params (?q=a&q=b) arrive as arrays. Take the first rather than
  // rejecting: it is almost always a link-building artefact, not an attack.
  const flat: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(raw)) {
    flat[key] = Array.isArray(value) ? value[0] : value;
  }

  const parsed = searchParamsSchema.safeParse(flat);
  return parsed.success ? parsed.data : searchParamsSchema.parse({});
}

/**
 * Rebuild a query string from parsed params.
 *
 * Used for filter links and pagination. Only non-default values are emitted, so
 * the URL stays short and — more importantly — one set of filters always
 * produces one canonical URL rather than several equivalent ones competing in
 * the index.
 */
export function buildSearchQuery(
  params: Partial<SearchParams>,
  overrides: Partial<SearchParams> = {},
): string {
  const merged = { ...params, ...overrides };
  const search = new URLSearchParams();

  if (merged.q) search.set("q", merged.q);
  if (merged.mode && merged.mode !== "products") search.set("mode", merged.mode);
  if (merged.category) search.set("category", merged.category);
  if (merged.location) search.set("location", merged.location);
  if (merged.minPrice !== undefined) search.set("minPrice", String(merged.minPrice));
  if (merged.maxPrice !== undefined) search.set("maxPrice", String(merged.maxPrice));
  if (merged.pricedOnly) search.set("pricedOnly", "1");
  if (merged.verifiedOnly) search.set("verifiedOnly", "1");
  if (merged.everywhere) search.set("everywhere", "1");
  if (merged.sort && merged.sort !== "relevance") search.set("sort", merged.sort);
  if (merged.page && merged.page > 1) search.set("page", String(merged.page));

  const query = search.toString();
  return query ? `?${query}` : "";
}

/** True when any filter narrows the result set — drives the "clear all" UI. */
export function hasActiveFilters(params: SearchParams): boolean {
  return Boolean(
    params.q ||
    params.category ||
    params.location ||
    params.minPrice !== undefined ||
    params.maxPrice !== undefined ||
    params.pricedOnly ||
    params.verifiedOnly,
  );
}

export const SORT_LABELS: Record<SortOption, string> = {
  relevance: "Most relevant",
  newest: "Newest first",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
};
