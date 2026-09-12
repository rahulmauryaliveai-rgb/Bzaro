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

type CategoryNode = { slug: string; name: string; children?: CategoryNode[] };

const CATEGORY_TREE: CategoryNode[] = [
  {
    slug: "electronics",
    name: "Electronics & Electrical",
    children: [
      {
        slug: "lighting",
        name: "Lighting",
        children: [
          { slug: "led-bulbs", name: "LED Bulbs" },
          { slug: "led-panels", name: "LED Panels" },
          { slug: "street-lights", name: "Street Lights" },
        ],
      },
      {
        slug: "cables-wires",
        name: "Cables & Wires",
        children: [
          { slug: "copper-cables", name: "Copper Cables" },
          { slug: "control-cables", name: "Control Cables" },
        ],
      },
    ],
  },
  {
    slug: "building-construction",
    name: "Building & Construction",
    children: [
      {
        slug: "steel",
        name: "Steel & Metal",
        children: [
          { slug: "tmt-bars", name: "TMT Bars" },
          { slug: "steel-pipes", name: "Steel Pipes" },
          { slug: "steel-sheets", name: "Steel Sheets" },
        ],
      },
      { slug: "cement", name: "Cement" },
    ],
  },
  {
    slug: "textiles",
    name: "Textiles & Fabrics",
    children: [
      { slug: "cotton-fabric", name: "Cotton Fabric" },
      { slug: "industrial-textiles", name: "Industrial Textiles" },
    ],
  },
  {
    slug: "industrial-supplies",
    name: "Industrial Supplies",
    children: [
      { slug: "hand-tools", name: "Hand Tools" },
      { slug: "power-tools", name: "Power Tools" },
      { slug: "safety-equipment", name: "Safety Equipment" },
    ],
  },
];

type LocationNode = {
  slug: string;
  name: string;
  type: "COUNTRY" | "STATE" | "CITY" | "LOCALITY";
  children?: LocationNode[];
};

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
      {
        slug: "delhi",
        name: "Delhi",
        type: "STATE",
        children: [{ slug: "new-delhi", name: "New Delhi", type: "CITY" }],
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
        },
        update: { name: node.name, ancestorIds: ancestors },
        select: { id: true },
      });

      locations[node.slug] = row.id;

      if (node.children) {
        await walkLocations(node.children, row.id, path, [...ancestors, row.id]);
      }
    }
  }

  await walkCategories(CATEGORY_TREE, null, "", [], 0);
  await walkLocations(LOCATION_TREE, null, "", []);

  return { categories, locations };
}

export type SeededTaxonomy = Awaited<ReturnType<typeof seedTaxonomy>>;
