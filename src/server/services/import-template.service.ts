import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { cacheTags } from "@/lib/cache/tags";
import type { TemplateCategory } from "@/lib/import/template";
import type { CategoryLookup } from "@/lib/import/parse";

/**
 * The taxonomy as bulk upload needs it (D49).
 *
 * One source for both halves: the template's dropdowns and the parser's
 * matching. Building them separately is how a seller ends up choosing a
 * category from a dropdown that the importer then calls unknown.
 *
 * ── What a "leaf" is ────────────────────────────────────────────────────────
 * An active category with no active children. The template offers leaves only,
 * because a product filed against "Electronics & Electrical" rather than "LED
 * Bulbs" is invisible to every buyer who browses down the tree.
 *
 * Depth is deliberately NOT used to decide this. Branches are uneven — some
 * run two levels, some three — so "depth === 2" would silently drop every leaf
 * sitting one level up, and would quietly shrink the template the day an admin
 * adds a level anywhere.
 *
 * ── Main Category is the ROOT ancestor ──────────────────────────────────────
 * Not the parent. "LED Bulbs" sits under "Lighting" under "Electronics &
 * Electrical", and the first dropdown has to offer the fifty-one names a
 * seller recognises, not three hundred mid-tree nodes. The middle of the path
 * is not lost: it is shown in the Categories sheet's Full Path column, which
 * is what disambiguates two leaves with the same name.
 */

/** Cached: the tree changes when an admin edits it, which is rare. */
const TEMPLATE_REVALIDATE = 60 * 60;

export type TemplateTaxonomy = {
  categories: TemplateCategory[];
  /** What the parser matches a Sub Category cell against. */
  lookup: CategoryLookup;
};

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  ancestorIds: string[];
  sortOrder: number;
};

/**
 * Every active category, flat. One query rather than a recursive walk: the
 * whole tree is ~400 rows (D34), and `ancestorIds` already carries the
 * materialised path, so the tree can be reconstructed in memory.
 */
function loadActiveCategories(): Promise<CategoryRow[]> {
  return unstable_cache(
    () =>
      db.category.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          slug: true,
          parentId: true,
          ancestorIds: true,
          sortOrder: true,
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        take: 2000,
      }),
    ["import-template-categories"],
    { tags: [cacheTags.categoryTree()], revalidate: TEMPLATE_REVALIDATE },
  )();
}

/**
 * The tree flattened depth-first in the order an admin curated.
 *
 * `sortOrder` is what every public surface sorts by — "Electronics &
 * Electrical" is first because it is the biggest category here, not because of
 * its name. Sorting the template's dropdown alphabetically instead would put
 * "Agriculture" in front of it and bury the common choices, so the template
 * follows the order of the marketplace the seller already knows.
 *
 * Depth-first rather than one sort over the flat list, because leaves have to
 * come out grouped under their own branch: the hidden Lists sheet writes one
 * column per main category and reads this order straight through.
 */
function depthFirst(rows: CategoryRow[]): CategoryRow[] {
  const childrenOf = new Map<string | null, CategoryRow[]>();

  for (const row of rows) {
    const siblings = childrenOf.get(row.parentId);
    if (siblings) siblings.push(row);
    else childrenOf.set(row.parentId, [row]);
  }

  const ordered: CategoryRow[] = [];

  const walk = (parentId: string | null) => {
    for (const row of childrenOf.get(parentId) ?? []) {
      ordered.push(row);
      walk(row.id);
    }
  };

  walk(null);

  // A category whose PARENT is inactive is unreachable by the walk, but is
  // itself an active category a product may legitimately be filed under.
  // Appending it is better than dropping it: a dropped category is a product
  // the seller cannot import and no message explains why.
  if (ordered.length < rows.length) {
    const seen = new Set(ordered.map((row) => row.id));
    for (const row of rows) if (!seen.has(row.id)) ordered.push(row);
  }

  return ordered;
}

export async function getTemplateTaxonomy(): Promise<TemplateTaxonomy> {
  const rows = depthFirst(await loadActiveCategories());

  const byId = new Map(rows.map((row) => [row.id, row]));
  const hasActiveChild = new Set(rows.flatMap((row) => (row.parentId ? [row.parentId] : [])));

  const categories: TemplateCategory[] = [];

  for (const row of rows) {
    if (hasActiveChild.has(row.id)) continue;

    // ancestorIds runs root-first. A root-level leaf has none, and is then its
    // own Main Category.
    const ancestors = row.ancestorIds.flatMap((id) => {
      const ancestor = byId.get(id);
      return ancestor ? [ancestor] : [];
    });

    categories.push({
      id: row.id,
      main: ancestors[0]?.name ?? row.name,
      sub: row.name,
      fullPath: [...ancestors.map((ancestor) => ancestor.name), row.name].join(" > "),
    });
  }

  return { categories, lookup: buildLookup(categories, byId) };
}

/**
 * What the parser matches a Sub Category cell against.
 *
 * Three keys per leaf, each for a real way a cell arrives:
 *
 *   "led bulbs"                             the name, as the dropdown offers it
 *   "led-bulbs"                             the slug — what a seller exporting
 *                                           from their own system, or copying
 *                                           out of a Bzaro URL, actually has
 *   "electronics & electrical > led bulbs"  main + leaf, the only thing that
 *                                           tells two branches apart when both
 *                                           own the same leaf name
 *
 * On a plain-name collision the first in taxonomy order takes the key, but the
 * `ambiguous` set makes the parser refuse to use it and ask instead (see
 * `resolveCategory`). Silently filing a product under whichever branch sorted
 * first is the one outcome worth preventing: it is invisible to the seller,
 * who finds out when a buyer does not.
 */
function buildLookup(
  leaves: TemplateCategory[],
  byId: Map<string, CategoryRow>,
): CategoryLookup {
  const byName = new Map<string, string>();
  const pathById = new Map<string, string>();
  const nameCounts = new Map<string, number>();

  for (const leaf of leaves) {
    pathById.set(leaf.id, leaf.fullPath);

    const name = leaf.sub.trim().toLowerCase();
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);

    const slug = byId.get(leaf.id)?.slug.trim().toLowerCase() ?? "";

    for (const key of [name, slug, `${leaf.main.trim().toLowerCase()} > ${name}`]) {
      if (key && !byName.has(key)) byName.set(key, leaf.id);
    }
  }

  return {
    byName,
    pathById,
    ambiguous: new Set([...nameCounts].filter(([, count]) => count > 1).map(([name]) => name)),
  };
}
