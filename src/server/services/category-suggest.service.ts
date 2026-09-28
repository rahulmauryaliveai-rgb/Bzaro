import "server-only";
import { db } from "@/lib/db";

/**
 * "What do you need?" → which category (D43).
 *
 * Buyers type products ("LED bulb 9W", "hikvision dome camera"), not the
 * taxonomy's names. Two signals, merged:
 *
 *   1. The category tree: the name (exact, prefix, contained, trigram-similar
 *      in either direction) and the admin-curated `keywords`.
 *   2. The live catalogue: categories of published products whose name looks
 *      like what was typed — sellers' own words map buyer words onto the tree.
 *
 * Deeper categories win ties, because a subcategory sends the lead to sellers
 * of exactly that thing rather than a whole top-level group.
 */

export type CategorySuggestion = {
  id: string;
  name: string;
  /** "Electrical & Lighting › Lighting" — the ancestors, for context. */
  trail: string;
};

type Row = {
  id: string;
  name: string;
  depth: number;
  ancestorIds: string[];
  score: number;
};

export function normaliseQuery(input: string): string | null {
  const q = input.replace(/\s+/g, " ").trim().slice(0, 80);
  return q.length >= 2 ? q : null;
}

export async function suggestCategories(input: string, limit = 6): Promise<CategorySuggestion[]> {
  const q = normaliseQuery(input);
  if (!q) return [];
  const lower = q.toLowerCase();
  // Individual words of 3+ letters, so "led bulb 9w" can match "LED Bulbs".
  const words = [...new Set(lower.split(/[^a-z0-9]+/).filter((w) => w.length >= 3))].slice(0, 6);

  const [byTree, byCatalogue] = await Promise.all([
    db.$queryRaw<Row[]>`
      SELECT c."id", c."name", c."depth", c."ancestorIds",
        GREATEST(
          CASE WHEN lower(c."name") = ${lower} THEN 1.0 ELSE 0 END,
          CASE WHEN c."name" ILIKE ${`${q}%`} THEN 0.92 ELSE 0 END,
          CASE WHEN c."name" ILIKE ${`%${q}%`} THEN 0.8 ELSE 0 END,
          CASE WHEN EXISTS (
            SELECT 1 FROM unnest(c."keywords") k
            WHERE k <> '' AND (${lower} LIKE '%' || k || '%' OR k LIKE ${`${lower}%`})
          ) THEN 0.88 ELSE 0 END,
          (
            SELECT CASE WHEN count(*) = 0 THEN 0
              ELSE 0.55 + 0.3 * count(*)::float / ${Math.max(words.length, 1)} END
            FROM unnest(${words}::text[]) w
            WHERE lower(c."name") ~ ('\\m' || w)
          ),
          word_similarity(${q}, c."name"),
          word_similarity(c."name", ${q}) * 0.9
        )::float AS score
      FROM "Category" c
      WHERE c."isActive" = true
      ORDER BY score DESC, c."depth" DESC, c."sellerCount" DESC
      LIMIT 12`,
    db.$queryRaw<Array<{ categoryId: string; n: bigint }>>`
      SELECT p."categoryId", count(*) AS n
      FROM "Product" p
      JOIN "Seller" s ON s."id" = p."sellerId"
      WHERE p."status" = 'PUBLISHED' AND p."deletedAt" IS NULL
        AND p."moderationStatus" = 'APPROVED' AND p."categoryId" IS NOT NULL
        AND s."status" = 'VERIFIED' AND s."deletedAt" IS NULL
        AND (p."name" ILIKE ${`%${q}%`} OR word_similarity(${q}, p."name") > 0.55)
      GROUP BY p."categoryId"
      ORDER BY n DESC
      LIMIT 4`,
  ]);

  const ranked = mergeSuggestionScores(
    byTree,
    byCatalogue.map((row) => ({ categoryId: row.categoryId, n: Number(row.n) })),
  ).slice(0, limit);
  if (ranked.length === 0) return [];
  const categories = await db.category.findMany({
    where: { id: { in: ranked.map(([id]) => id) }, isActive: true },
    select: { id: true, name: true, ancestorIds: true },
  });
  const ancestorIds = [...new Set(categories.flatMap((c) => c.ancestorIds))];
  const ancestors = ancestorIds.length
    ? await db.category.findMany({
        where: { id: { in: ancestorIds } },
        select: { id: true, name: true },
      })
    : [];
  const names = new Map(ancestors.map((a) => [a.id, a.name]));
  const byId = new Map(categories.map((c) => [c.id, c]));

  return ranked.flatMap(([id]) => {
    const category = byId.get(id);
    if (!category) return [];
    return [
      {
        id: category.id,
        name: category.name,
        trail: category.ancestorIds
          .map((ancestorId) => names.get(ancestorId))
          .filter(Boolean)
          .join(" › "),
      },
    ];
  });
}

/**
 * Merge the two signals into one ranking.
 *
 * The category's own name/keywords lead. The catalogue only supports it: a
 * category that also holds matching products gets a small boost, and a
 * category found *only* through products tops out below a half-matched name —
 * one seller filing "CCTV camera" under Networking must not outrank
 * "CCTV & Surveillance".
 */
export function mergeSuggestionScores(
  tree: ReadonlyArray<{ id: string; score: number; depth: number }>,
  catalogue: ReadonlyArray<{ categoryId: string; n: number }>,
): Array<[string, number]> {
  const scores = new Map<string, number>();
  for (const row of tree) {
    if (row.score >= 0.4) scores.set(row.id, row.score + row.depth * 0.02);
  }
  for (const row of catalogue) {
    const fromTree = scores.get(row.categoryId);
    scores.set(
      row.categoryId,
      fromTree !== undefined ? fromTree + 0.08 : 0.55 + Math.min(row.n, 10) * 0.01,
    );
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]);
}

/** Admin input "CCTV, Camera ,dvr" → ["cctv","camera","dvr"]. */
export function parseKeywords(input: string): string[] {
  return [
    ...new Set(
      input
        .split(/[,\n]/)
        .map((word) => word.trim().toLowerCase().replace(/\s+/g, " "))
        .filter((word) => word.length >= 2 && word.length <= 40),
    ),
  ].slice(0, 40);
}
