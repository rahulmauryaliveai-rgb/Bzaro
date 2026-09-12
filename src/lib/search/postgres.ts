import "server-only";
import { db, Prisma } from "@/lib/db";
import type {
  Facet,
  ProductHit,
  ProductSearchInput,
  SearchFacets,
  SearchProvider,
  SearchResult,
  SellerHit,
  SellerSearchInput,
} from "@/lib/search/types";

/**
 * PostgreSQL full-text search (decision D4).
 *
 * ── Injection safety ─────────────────────────────────────────────────────────
 * Every value is interpolated through `Prisma.sql` tagged templates, which
 * parameterise. There is NO string concatenation of user input anywhere in this
 * file. `ORDER BY` cannot be parameterised, so it is selected from a fixed map
 * keyed by a Zod enum — the only values that can reach it are ones we wrote.
 *
 * ── How the query works ──────────────────────────────────────────────────────
 * `websearch_to_tsquery` parses the query the way a person expects: quoted
 * phrases, `-excluded` terms, `or`. Plain `to_tsquery` throws on unbalanced
 * input, which would turn a stray apostrophe into a 500.
 *
 * Matches run against the STORED generated column `searchVector` (weighted
 * name > brand > short description > description) with a GIN index, so ranking
 * costs nothing extra at query time.
 *
 * ── Fuzzy fallback ───────────────────────────────────────────────────────────
 * Exact FTS finds nothing for typos and partial part numbers, which is most of
 * what people actually type. When a query returns zero rows we retry with
 * trigram similarity and mark the result `fuzzy: true` so the UI can say
 * "showing results for…" rather than silently pretending these were exact.
 */

/** Only ever expose live content from live sellers. */
const LIVE_PRODUCT = Prisma.sql`
  p."status" = 'PUBLISHED'
  AND p."deletedAt" IS NULL
  AND p."moderationStatus" = 'APPROVED'
`;

/**
 * A seller must be VERIFIED to appear anywhere on the marketplace.
 *
 * Note this is NOT the same gate as `SellerWebsite.indexable`: a sparse seller
 * still appears in marketplace search — that is how they get discovered — while
 * their own microsite stays out of the search-engine index until it has
 * substance. Conflating the two would make new sellers invisible to buyers, not
 * just to crawlers.
 */
const LIVE_SELLER = Prisma.sql`
  s."status" = 'VERIFIED'
  AND s."deletedAt" IS NULL
`;

/**
 * Minimum trigram score for a fuzzy hit.
 *
 * Measured with `word_similarity`, NOT `similarity`. The difference matters:
 * `similarity()` normalises across the whole string, so the typo "panle"
 * against "LED Panel Light 40W" scores 0.136 — indistinguishable from noise,
 * because most of the target string is unrelated to the query.
 * `word_similarity()` finds the best-matching run inside the target and scores
 * the same pair at 0.500.
 *
 * Since queries are almost always shorter than the product names they are
 * looking for, `word_similarity` is the correct measure here. Real typos land
 * around 0.5–0.6, so 0.35 admits them while keeping unrelated products out.
 */
const FUZZY_THRESHOLD = 0.35;

function tsquery(query: string): Prisma.Sql {
  return Prisma.sql`websearch_to_tsquery('english', ${query})`;
}

/**
 * Category subtree membership.
 *
 * `ancestorIds` carries every ancestor and is GIN-indexed, so "everything under
 * Electronics" is one indexed lookup rather than a recursive CTE.
 */
function categorySubtree(categoryId: string): Prisma.Sql {
  return Prisma.sql`
    p."categoryId" IN (
      SELECT c2."id" FROM "Category" c2
      WHERE c2."id" = ${categoryId} OR ${categoryId} = ANY(c2."ancestorIds")
    )
  `;
}

function locationSubtree(locationId: string): Prisma.Sql {
  return Prisma.sql`
    s."locationId" IN (
      SELECT l2."id" FROM "Location" l2
      WHERE l2."id" = ${locationId} OR ${locationId} = ANY(l2."ancestorIds")
    )
  `;
}

/** Build the shared WHERE fragment for a product search. */
function productConditions(
  input: ProductSearchInput,
  options: { withQuery: boolean; ignoreCategory?: boolean; ignoreLocation?: boolean } = {
    withQuery: true,
  },
): Prisma.Sql[] {
  const conditions: Prisma.Sql[] = [LIVE_PRODUCT, LIVE_SELLER];

  if (options.withQuery && input.query) {
    conditions.push(Prisma.sql`p."searchVector" @@ ${tsquery(input.query)}`);
  }

  if (input.categoryId && !options.ignoreCategory) {
    conditions.push(categorySubtree(input.categoryId));
  }

  if (input.locationId && !options.ignoreLocation) {
    conditions.push(locationSubtree(input.locationId));
  }

  if (input.sellerId) {
    conditions.push(Prisma.sql`p."sellerId" = ${input.sellerId}`);
  }

  if (input.verifiedOnly) {
    conditions.push(Prisma.sql`s."verifiedAt" IS NOT NULL`);
  }

  // A price bound implies the listing must actually have a price — otherwise
  // "under ₹500" would include every price-on-request item.
  if (input.minPriceMinor !== undefined) {
    conditions.push(Prisma.sql`p."priceMinor" >= ${input.minPriceMinor}`);
  }
  if (input.maxPriceMinor !== undefined) {
    conditions.push(Prisma.sql`p."priceMinor" <= ${input.maxPriceMinor}`);
  }
  if (input.pricedOnly) {
    conditions.push(Prisma.sql`p."priceMinor" IS NOT NULL AND p."priceOnRequest" = false`);
  }

  return conditions;
}

function and(conditions: Prisma.Sql[]): Prisma.Sql {
  return Prisma.join(conditions, " AND ");
}

/**
 * ORDER BY, chosen from a fixed map.
 *
 * Featured always leads: sellers pay for that placement (D5), so it is a
 * product decision rather than an incidental one. Within a tier, relevance
 * ranking applies only when there is a query to rank against.
 *
 * NULLS LAST on price matters: price-on-request rows have a NULL price and
 * would otherwise sort to the top of a "cheapest first" list, which reads as
 * broken.
 */
function orderBy(sort: ProductSearchInput["sort"], hasQuery: boolean): Prisma.Sql {
  switch (sort) {
    case "newest":
      return Prisma.sql`p."isFeatured" DESC, p."createdAt" DESC`;
    case "price_asc":
      return Prisma.sql`p."isFeatured" DESC, p."priceMinor" ASC NULLS LAST, p."createdAt" DESC`;
    case "price_desc":
      return Prisma.sql`p."isFeatured" DESC, p."priceMinor" DESC NULLS LAST, p."createdAt" DESC`;
    case "relevance":
    default:
      return hasQuery
        ? Prisma.sql`p."isFeatured" DESC, rank DESC, p."createdAt" DESC`
        : Prisma.sql`p."isFeatured" DESC, p."createdAt" DESC`;
  }
}

type ProductRow = Omit<ProductHit, "createdAt"> & { createdAt: Date };

class PostgresSearchProvider implements SearchProvider {
  readonly name = "postgres";

  async searchProducts(input: ProductSearchInput): Promise<SearchResult<ProductHit>> {
    const startedAt = Date.now();

    const exact = await this.runProductQuery(input, false);
    if (exact.total > 0 || !input.query) {
      return { ...exact, fuzzy: false, tookMs: Date.now() - startedAt };
    }

    // Nothing matched exactly. Most real queries that miss are typos or partial
    // part numbers, so retry on trigram similarity rather than showing a dead
    // end.
    const fuzzy = await this.runProductQuery(input, true);
    return { ...fuzzy, fuzzy: fuzzy.total > 0, tookMs: Date.now() - startedAt };
  }

  private async runProductQuery(
    input: ProductSearchInput,
    useFuzzy: boolean,
  ): Promise<Omit<SearchResult<ProductHit>, "fuzzy" | "tookMs">> {
    const conditions = productConditions(input, { withQuery: !useFuzzy });

    if (useFuzzy && input.query) {
      conditions.push(
        Prisma.sql`(
          word_similarity(${input.query}, p."name") > ${FUZZY_THRESHOLD}
          OR word_similarity(${input.query}, coalesce(p."brand", '')) > ${FUZZY_THRESHOLD}
        )`,
      );
    }

    const where = and(conditions);
    const offset = (input.page - 1) * input.perPage;

    const rankExpression =
      input.query && !useFuzzy
        ? Prisma.sql`ts_rank(p."searchVector", ${tsquery(input.query)})`
        : input.query && useFuzzy
          ? Prisma.sql`word_similarity(${input.query}, p."name")`
          : Prisma.sql`0`;

    const order = useFuzzy
      ? Prisma.sql`p."isFeatured" DESC, rank DESC, p."createdAt" DESC`
      : orderBy(input.sort, Boolean(input.query));

    const [rows, countRows] = await Promise.all([
      db.$queryRaw<ProductRow[]>`
        SELECT
          p."id",
          p."slug",
          p."name",
          p."shortDescription",
          p."brand",
          p."priceMinor",
          p."priceMaxMinor",
          p."currency",
          p."unit",
          p."priceOnRequest",
          p."isFeatured",
          p."createdAt",
          s."slug"          AS "sellerSlug",
          s."businessName"  AS "sellerName",
          (s."verifiedAt" IS NOT NULL) AS "sellerVerified",
          loc."name"        AS "sellerCity",
          par."name"        AS "sellerState",
          c."name"          AS "categoryName",
          c."path"          AS "categoryPath",
          img."url"         AS "imageUrl",
          img."alt"         AS "imageAlt",
          ${rankExpression} AS rank
        FROM "Product" p
        JOIN "Seller" s        ON s."id" = p."sellerId"
        LEFT JOIN "Category" c ON c."id" = p."categoryId"
        LEFT JOIN "Location" loc ON loc."id" = s."locationId"
        LEFT JOIN "Location" par ON par."id" = loc."parentId"
        LEFT JOIN LATERAL (
          SELECT pi."url", pi."alt"
          FROM "ProductImage" pi
          WHERE pi."productId" = p."id" AND pi."moderationStatus" = 'APPROVED'
          ORDER BY pi."sortOrder" ASC
          LIMIT 1
        ) img ON true
        WHERE ${where}
        ORDER BY ${order}
        LIMIT ${input.perPage} OFFSET ${offset}
      `,
      db.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*)::bigint AS count
        FROM "Product" p
        JOIN "Seller" s ON s."id" = p."sellerId"
        WHERE ${where}
      `,
    ]);

    const total = Number(countRows[0]?.count ?? 0);

    return {
      hits: rows.map(stripRank),
      total,
      page: input.page,
      pageCount: Math.max(1, Math.ceil(total / input.perPage)),
    };
  }

  async searchSellers(input: SellerSearchInput): Promise<SearchResult<SellerHit>> {
    const startedAt = Date.now();

    const conditions: Prisma.Sql[] = [LIVE_SELLER];

    if (input.query) {
      // Sellers are searched by business name far more than by description, so
      // a trigram match on the name is both cheaper and more accurate here than
      // a full tsvector would be.
      conditions.push(
        Prisma.sql`(
          s."businessName" ILIKE ${`%${input.query}%`}
          OR word_similarity(${input.query}, s."businessName") > ${FUZZY_THRESHOLD}
        )`,
      );
    }

    if (input.locationId) conditions.push(locationSubtree(input.locationId));
    if (input.verifiedOnly) conditions.push(Prisma.sql`s."verifiedAt" IS NOT NULL`);

    if (input.categoryId) {
      conditions.push(Prisma.sql`
        EXISTS (
          SELECT 1 FROM "SellerCategory" sc
          JOIN "Category" c2 ON c2."id" = sc."categoryId"
          WHERE sc."sellerId" = s."id"
            AND (c2."id" = ${input.categoryId} OR ${input.categoryId} = ANY(c2."ancestorIds"))
        )
      `);
    }

    const where = and(conditions);
    const offset = (input.page - 1) * input.perPage;

    const order = input.query
      ? Prisma.sql`word_similarity(${input.query}, s."businessName") DESC, s."ratingAvg" DESC`
      : input.sort === "newest"
        ? Prisma.sql`s."createdAt" DESC`
        : Prisma.sql`s."ratingAvg" DESC, s."productCount" DESC`;

    const [rows, countRows] = await Promise.all([
      db.$queryRaw<SellerHit[]>`
        SELECT
          s."id",
          s."slug",
          s."businessName",
          s."tagline",
          s."description",
          s."logoUrl",
          s."productCount",
          s."serviceCount",
          s."ratingAvg",
          s."ratingCount",
          s."establishedYear",
          (s."verifiedAt" IS NOT NULL) AS "isVerified",
          loc."name" AS "city",
          par."name" AS "state"
        FROM "Seller" s
        LEFT JOIN "Location" loc ON loc."id" = s."locationId"
        LEFT JOIN "Location" par ON par."id" = loc."parentId"
        WHERE ${where}
        ORDER BY ${order}
        LIMIT ${input.perPage} OFFSET ${offset}
      `,
      db.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*)::bigint AS count FROM "Seller" s WHERE ${where}
      `,
    ]);

    const total = Number(countRows[0]?.count ?? 0);

    return {
      hits: rows,
      total,
      page: input.page,
      pageCount: Math.max(1, Math.ceil(total / input.perPage)),
      fuzzy: false,
      tookMs: Date.now() - startedAt,
    };
  }

  /**
   * Facet counts.
   *
   * Each facet is counted with its OWN filter removed — standard faceted search
   * behaviour. Counting categories while the category filter is applied would
   * return only the selected category with the full count, which tells the user
   * nothing and makes the panel useless for widening a search.
   */
  async facets(input: ProductSearchInput): Promise<SearchFacets> {
    const categoryWhere = and(productConditions(input, { withQuery: true, ignoreCategory: true }));
    const locationWhere = and(productConditions(input, { withQuery: true, ignoreLocation: true }));

    const [categories, locations] = await Promise.all([
      db.$queryRaw<Array<{ value: string; label: string; count: bigint }>>`
        SELECT c."path" AS value, c."name" AS label, count(*)::bigint AS count
        FROM "Product" p
        JOIN "Seller" s        ON s."id" = p."sellerId"
        JOIN "Category" c      ON c."id" = p."categoryId"
        WHERE ${categoryWhere}
        GROUP BY c."path", c."name"
        ORDER BY count DESC, c."name" ASC
        LIMIT 15
      `,
      db.$queryRaw<Array<{ value: string; label: string; count: bigint }>>`
        SELECT loc."path" AS value, loc."name" AS label, count(*)::bigint AS count
        FROM "Product" p
        JOIN "Seller" s          ON s."id" = p."sellerId"
        JOIN "Location" loc      ON loc."id" = s."locationId"
        WHERE ${locationWhere}
        GROUP BY loc."path", loc."name"
        ORDER BY count DESC, loc."name" ASC
        LIMIT 15
      `,
    ]);

    return {
      categories: categories.map(toFacet),
      locations: locations.map(toFacet),
    };
  }

  async suggest(query: string, limit = 8): Promise<string[]> {
    if (query.trim().length < 2) return [];

    const rows = await db.$queryRaw<Array<{ name: string }>>`
      SELECT DISTINCT p."name"
      FROM "Product" p
      JOIN "Seller" s ON s."id" = p."sellerId"
      WHERE ${LIVE_PRODUCT}
        AND ${LIVE_SELLER}
        AND p."name" ILIKE ${`%${query}%`}
      ORDER BY p."name" ASC
      LIMIT ${limit}
    `;

    return rows.map((row) => row.name);
  }
}

function toFacet(row: { value: string; label: string; count: bigint }): Facet {
  return { value: row.value, label: row.label, count: Number(row.count) };
}

/** `rank` is an internal ordering column and never leaves this module. */
function stripRank(row: ProductRow & { rank?: unknown }): ProductHit {
  const { rank: _rank, ...hit } = row as ProductRow & { rank?: unknown };
  return hit;
}

export const postgresSearchProvider = new PostgresSearchProvider();
