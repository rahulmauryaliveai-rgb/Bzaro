import "server-only";
import { postgresSearchProvider } from "@/lib/search/postgres";
import type { SearchProvider } from "@/lib/search/types";

/**
 * The active search provider (decision D4).
 *
 * One export, so swapping engines is a single line here rather than a grep
 * across the application. Nothing outside `lib/search/` imports the Postgres
 * implementation directly.
 *
 * Migrate when D4's trip conditions fire: >1M documents, p95 above 300 ms, or
 * faceting across more than 6 dimensions. `SearchResult.tookMs` is reported on
 * every query precisely so that second condition is measurable rather than a
 * matter of opinion.
 */
export const search: SearchProvider = postgresSearchProvider;

export * from "@/lib/search/types";
