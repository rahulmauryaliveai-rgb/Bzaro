import type { PrismaClient } from "../../src/generated/prisma/client";

/**
 * Categories and locations.
 *
 * Both are adjacency lists carrying a materialised `path` and an `ancestorIds`
 * array. `ancestorIds` has a GIN index, which turns "everything under
 * Electronics" into one indexed lookup instead of a recursive CTE — the query
 * that every category page runs.
 *
 * Keeping those denormalised fields correct is the job of the service layer in
 * Phase 3; here the seed computes them directly as it walks the tree.
 */

import { CATEGORY_TREE, countNodes, type CategoryNode } from "./data/categories";

type LocationNode = {
  slug: string;
  name: string;
  type: "COUNTRY" | "STATE" | "CITY" | "LOCALITY";
  /** Metro cluster for the lead matcher's city tier (docs/LEADS.md). */
  clusterKey?: string;
  children?: LocationNode[];
};

const NCR = "ncr";

const LOCATION_TREE: LocationNode[] = [
  {
    slug: "in",
    name: "India",
    type: "COUNTRY",
    children: [
      {
        slug: "maharashtra",
        name: "Maharashtra",
        type: "STATE",
        children: [
          { slug: "mumbai", name: "Mumbai", type: "CITY" },
          { slug: "pune", name: "Pune", type: "CITY" },
          { slug: "nagpur", name: "Nagpur", type: "CITY" },
        ],
      },
      {
        slug: "gujarat",
        name: "Gujarat",
        type: "STATE",
        children: [
          { slug: "ahmedabad", name: "Ahmedabad", type: "CITY" },
          { slug: "surat", name: "Surat", type: "CITY" },
        ],
      },
      // The NCR cities span three states but trade as one market — a buyer in
      // Noida is happy to source from Gurugram. `clusterKey` lets the matcher
      // rank them between "same city" and "serves this city".
      {
        slug: "delhi",
        name: "Delhi",
        type: "STATE",
        children: [{ slug: "new-delhi", name: "New Delhi", type: "CITY", clusterKey: NCR }],
      },
      {
        slug: "haryana",
        name: "Haryana",
        type: "STATE",
        children: [
          { slug: "gurugram", name: "Gurugram", type: "CITY", clusterKey: NCR },
          { slug: "faridabad", name: "Faridabad", type: "CITY", clusterKey: NCR },
        ],
      },
      {
        slug: "uttar-pradesh",
        name: "Uttar Pradesh",
        type: "STATE",
        children: [
          { slug: "noida", name: "Noida", type: "CITY", clusterKey: NCR },
          { slug: "ghaziabad", name: "Ghaziabad", type: "CITY", clusterKey: NCR },
          { slug: "lucknow", name: "Lucknow", type: "CITY" },
        ],
      },
      {
        slug: "tamil-nadu",
        name: "Tamil Nadu",
        type: "STATE",
        children: [{ slug: "chennai", name: "Chennai", type: "CITY" }],
      },
    ],
  },
];

export async function seedTaxonomy(prisma: PrismaClient) {
  const categories: Record<string, string> = {};
  const locations: Record<string, string> = {};

  async function walkCategories(
    nodes: CategoryNode[],
    parentId: string | null,
    parentPath: string,
    ancestors: string[],
    depth: number,
  ) {
    for (const [index, node] of nodes.entries()) {
      const path = `${parentPath}/${node.slug}`;

      const row = await prisma.category.upsert({
        where: { path },
        create: {
          parentId,
          slug: node.slug,
          name: node.name,
          path,
          depth,
          ancestorIds: ancestors,
          sortOrder: index,
        },
        update: { name: node.name, depth, ancestorIds: ancestors, sortOrder: index },
        select: { id: true },
      });

      categories[node.slug] = row.id;

      if (node.children) {
        await walkCategories(node.children, row.id, path, [...ancestors, row.id], depth + 1);
      }
    }
  }

  async function walkLocations(
    nodes: LocationNode[],
    parentId: string | null,
    parentPath: string,
    ancestors: string[],
  ) {
    for (const node of nodes) {
      const path = `${parentPath}/${node.slug}`;

      const row = await prisma.location.upsert({
        where: { path },
        create: {
          parentId,
          slug: node.slug,
          name: node.name,
          type: node.type,
          path,
          ancestorIds: ancestors,
          clusterKey: node.clusterKey ?? null,
        },
        update: { name: node.name, ancestorIds: ancestors, clusterKey: node.clusterKey ?? null },
        select: { id: true },
      });

      locations[node.slug] = row.id;

      if (node.children) {
        await walkLocations(node.children, row.id, path, [...ancestors, row.id]);
      }
    }
  }

  await walkCategories(CATEGORY_TREE, null, "", [], 0);
  console.log(`   ${countNodes(CATEGORY_TREE)} categories in ${CATEGORY_TREE.length} groups`);
  await walkLocations(LOCATION_TREE, null, "", []);

  return { categories, locations };
}

export type SeededTaxonomy = Awaited<ReturnType<typeof seedTaxonomy>>;
