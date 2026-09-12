/**
 * The search contract (decision D4).
 *
 * PostgreSQL full-text search backs this today. The interface exists so that
 * migrating to Typesense or Meilisearch is one implementation file rather than
 * a rewrite — nothing outside `lib/search/` may know which engine is in use.
 *
 * D4's trip conditions, restated so they are visible at the boundary they
 * govern: migrate when any of these holds.
 *
 *   - more than 1M indexed documents
 *   - p95 search latency above 300 ms
 *   - faceting across more than 6 dimensions
 *
 * Until then Postgres is the right answer: one less system to run, no sync lag,
 * and transactional consistency with the catalogue.
 */

export type ProductHit = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  brand: string | null;
  priceMinor: number | null;
  priceMaxMinor: number | null;
  currency: string;
  unit: string | null;
  priceOnRequest: boolean;
  imageUrl: string | null;
  imageAlt: string | null;
  isFeatured: boolean;
  createdAt: Date;
  /** Denormalised onto the hit so result cards need no second query. */
  sellerSlug: string;
  sellerName: string;
  sellerVerified: boolean;
  sellerCity: string | null;
  sellerState: string | null;
  categoryName: string | null;
  categoryPath: string | null;
};

export type SellerHit = {
  id: string;
  slug: string;
  businessName: string;
  tagline: string | null;
  description: string | null;
  logoUrl: string | null;
  city: string | null;
  state: string | null;
  productCount: number;
  serviceCount: number;
  ratingAvg: number;
  ratingCount: number;
  isVerified: boolean;
  establishedYear: number | null;
};

/** One option in a filter panel, with its result count. */
export type Facet = {
  value: string;
  label: string;
  count: number;
};

export type SearchFacets = {
  categories: Facet[];
  locations: Facet[];
};

export type SearchResult<T> = {
  hits: T[];
  total: number;
  page: number;
  pageCount: number;
  /**
   * True when the exact-match query found nothing and results came from fuzzy
   * matching instead. The UI must say so — silently showing loosely-related
   * results for a precise part number makes the search look broken.
   */
  fuzzy: boolean;
  /** Milliseconds, for the p95 trip condition above. */
  tookMs: number;
};

export type ProductSearchInput = {
  query?: string;
  /** Category id plus its whole subtree. */
  categoryId?: string;
  /** Location id plus its whole subtree. */
  locationId?: string;
  /** Inclusive bounds in MINOR units. */
  minPriceMinor?: number;
  maxPriceMinor?: number;
  pricedOnly?: boolean;
  verifiedOnly?: boolean;
  sellerId?: string;
  sort: "relevance" | "newest" | "price_asc" | "price_desc";
  page: number;
  perPage: number;
};

export type SellerSearchInput = {
  query?: string;
  categoryId?: string;
  locationId?: string;
  verifiedOnly?: boolean;
  sort: "relevance" | "newest" | "price_asc" | "price_desc";
  page: number;
  perPage: number;
};

export interface SearchProvider {
  readonly name: string;
  searchProducts(input: ProductSearchInput): Promise<SearchResult<ProductHit>>;
  searchSellers(input: SellerSearchInput): Promise<SearchResult<SellerHit>>;
  /** Facet counts for the current filter set, minus the facet being counted. */
  facets(input: ProductSearchInput): Promise<SearchFacets>;
  /** Type-ahead suggestions. */
  suggest(query: string, limit?: number): Promise<string[]>;
}
