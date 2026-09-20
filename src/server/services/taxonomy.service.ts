import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { cacheTags } from "@/lib/cache/tags";

/**
 * Category and location lookups for the marketplace.
 *
 * The taxonomy changes rarely and is read by nearly every public page, so
 * everything here is cached aggressively and invalidated by tag when an admin
 * edits the tree.
 *
 * Both trees use a materialised `path` (`/electronics/lighting/led-bulbs`), so
 * a URL segment maps to a node with one indexed equality lookup — no recursive
 * descent, and the URL is readable.
 */

const TAXONOMY_REVALIDATE = 3600;

export type TaxonomyNode = {
  id: string;
  slug: string;
  name: string;
  path: string;
  description?: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
};

/** Resolve `["electronics","lighting"]` to a category. */
export function getCategoryByPath(segments: string[]) {
  const path = `/${segments.join("/")}`;

  return unstable_cache(
    async () =>
      db.category.findUnique({
        where: { path },
        select: {
          id: true,
          slug: true,
          name: true,
          path: true,
          description: true,
          metaTitle: true,
          metaDescription: true,
          depth: true,
          ancestorIds: true,
          parentId: true,
        },
      }),
    ["category-by-path", path],
    { tags: [cacheTags.categoryTree()], revalidate: TAXONOMY_REVALIDATE },
  )();
}

export function getLocationByPath(segments: string[]) {
  const path = `/${segments.join("/")}`;

  return unstable_cache(
    async () =>
      db.location.findUnique({
        where: { path },
        select: {
          id: true,
          slug: true,
          name: true,
          path: true,
          type: true,
          metaTitle: true,
          metaDescription: true,
          ancestorIds: true,
          parentId: true,
        },
      }),
    ["location-by-path", path],
    { tags: [cacheTags.locationTree()], revalidate: TAXONOMY_REVALIDATE },
  )();
}

/** Ancestors of a node, root-first — used to build breadcrumb trails. */
export function getCategoryAncestors(ancestorIds: string[]) {
  if (ancestorIds.length === 0) return Promise.resolve([]);

  return unstable_cache(
    async () => {
      const rows = await db.category.findMany({
        where: { id: { in: ancestorIds } },
        select: { id: true, name: true, path: true, depth: true },
        orderBy: { depth: "asc" },
      });
      return rows;
    },
    ["category-ancestors", ancestorIds.join(",")],
    { tags: [cacheTags.categoryTree()], revalidate: TAXONOMY_REVALIDATE },
  )();
}

/** Immediate children, for drilling down from a category page. */
export function getCategoryChildren(parentId: string | null) {
  return unstable_cache(
    async () =>
      db.category.findMany({
        where: { parentId, isActive: true },
        select: { id: true, name: true, slug: true, path: true, productCount: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        take: 60,
      }),
    ["category-children", parentId ?? "root"],
    { tags: [cacheTags.categoryTree()], revalidate: TAXONOMY_REVALIDATE },
  )();
}

/** Top-level categories, for the homepage and the search filter panel. */
export function getRootCategories() {
  return getCategoryChildren(null);
}

/** Cities with the most sellers — powers location links on the homepage. */
export function getPopularCities(limit = 12) {
  return unstable_cache(
    async () =>
      db.location.findMany({
        where: { type: "CITY", isActive: true },
        select: { id: true, slug: true, name: true, path: true, sellerCount: true },
        orderBy: [{ sellerCount: "desc" }, { name: "asc" }],
        take: limit,
      }),
    ["popular-cities", String(limit)],
    { tags: [cacheTags.locationTree()], revalidate: TAXONOMY_REVALIDATE },
  )();
}

/** Every active city, for the buyer city picker. Small and long-lived. */
export function getAllCities() {
  return unstable_cache(
    async () =>
      db.location.findMany({
        where: { type: "CITY", isActive: true },
        select: { id: true, slug: true, name: true, path: true },
        orderBy: [{ sellerCount: "desc" }, { name: "asc" }],
      }),
    ["all-cities"],
    { tags: [cacheTags.locationTree()], revalidate: TAXONOMY_REVALIDATE },
  )();
}

/**
 * Resolve a category path to an id, for filter parameters.
 * Returns null for an unknown path rather than throwing — a stale filter link
 * should widen the search, not break the page.
 */
export async function categoryIdFromPath(path: string | undefined): Promise<string | undefined> {
  if (!path) return undefined;
  const segments = path
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean);
  if (segments.length === 0) return undefined;

  const category = await getCategoryByPath(segments);
  return category?.id;
}

export async function locationIdFromPath(path: string | undefined): Promise<string | undefined> {
  if (!path) return undefined;
  const segments = path
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean);
  if (segments.length === 0) return undefined;

  const location = await getLocationByPath(segments);
  return location?.id;
}
