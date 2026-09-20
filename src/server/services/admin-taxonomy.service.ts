import "server-only";
import { db } from "@/lib/db";
import { slugify } from "@/lib/utils/slug";
import { revalidateCategory, revalidateLocation } from "@/lib/cache/revalidate";

/**
 * Admin taxonomy management: categories (D34 tree) and locations.
 *
 * Both tables are adjacency lists with a materialised `path` and
 * `ancestorIds`, kept correct here on every write — the discovery routes and
 * the lead matcher (docs/LEADS.md §3) read them without recursion. Nothing is
 * ever deleted: a category with products or sellers under it is deactivated,
 * which hides it from pickers and listings while every reference stays valid.
 */

// ── Categories ───────────────────────────────────────────────────────────────

export type AdminCategory = {
  id: string;
  name: string;
  slug: string;
  path: string;
  depth: number;
  isActive: boolean;
  sortOrder: number;
  imageUrl: string | null;
  productCount: number;
  sellerCount: number;
  children: AdminCategory[];
};

export async function listCategoryTree(): Promise<AdminCategory[]> {
  const rows = await db.category.findMany({
    orderBy: [{ depth: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      parentId: true,
      name: true,
      slug: true,
      path: true,
      depth: true,
      isActive: true,
      sortOrder: true,
      imageUrl: true,
      productCount: true,
      sellerCount: true,
    },
  });
  const byId = new Map<string, AdminCategory>();
  const roots: AdminCategory[] = [];
  for (const row of rows) {
    const node: AdminCategory = { ...row, children: [] };
    byId.set(row.id, node);
    const parent = row.parentId ? byId.get(row.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export async function createCategory(input: { name: string; parentId: string | null }) {
  const name = input.name.trim();
  const parent = input.parentId
    ? await db.category.findUnique({
        where: { id: input.parentId },
        select: { id: true, path: true, depth: true, ancestorIds: true },
      })
    : null;
  if (input.parentId && !parent) throw new Error("Parent category not found");
  if (parent && parent.depth >= 2) throw new Error("Categories go three levels deep at most");

  const base = slugify(name) || "category";
  // Slugs are globally unique in the seeded tree (D34) and the pickers
  // assume it; suffix on collision rather than fail.
  let slug = base;
  for (let n = 2; await db.category.findFirst({ where: { slug }, select: { id: true } }); n += 1) {
    slug = `${base}-${n}`;
  }
  const siblings = await db.category.count({ where: { parentId: input.parentId } });

  const row = await db.category.create({
    data: {
      name,
      slug,
      parentId: parent?.id ?? null,
      path: `${parent?.path ?? ""}/${slug}`,
      depth: parent ? parent.depth + 1 : 0,
      ancestorIds: parent ? [...parent.ancestorIds, parent.id] : [],
      sortOrder: siblings,
    },
    select: { id: true },
  });
  revalidateCategory(row.id, "immediate");
  return row;
}

export async function updateCategory(
  id: string,
  input: { name?: string; isActive?: boolean; imageUrl?: string | null; sortOrder?: number },
) {
  await db.category.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
  });
  revalidateCategory(id, "immediate");
}

// ── Locations ────────────────────────────────────────────────────────────────

export type AdminLocation = {
  id: string;
  name: string;
  slug: string;
  path: string;
  type: "COUNTRY" | "STATE" | "CITY" | "LOCALITY";
  isActive: boolean;
  clusterKey: string | null;
  sellerCount: number;
  children: AdminLocation[];
};

export async function listLocationTree(): Promise<AdminLocation[]> {
  const rows = await db.location.findMany({
    orderBy: [{ type: "asc" }, { name: "asc" }],
    select: {
      id: true,
      parentId: true,
      name: true,
      slug: true,
      path: true,
      type: true,
      isActive: true,
      clusterKey: true,
      sellerCount: true,
    },
  });
  // COUNTRY < STATE < CITY < LOCALITY is the enum order, so parents precede
  // children after the sort above.
  const byId = new Map<string, AdminLocation>();
  const roots: AdminLocation[] = [];
  for (const row of rows) {
    const node: AdminLocation = { ...row, children: [] };
    byId.set(row.id, node);
    const parent = row.parentId ? byId.get(row.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export async function createLocation(input: {
  name: string;
  parentId: string | null;
  type: "STATE" | "CITY";
  clusterKey?: string | null;
}) {
  const name = input.name.trim();
  const parent = input.parentId
    ? await db.location.findUnique({
        where: { id: input.parentId },
        select: { id: true, path: true, ancestorIds: true, type: true },
      })
    : null;
  if (input.type === "CITY" && !parent) throw new Error("A city needs a state");
  if (input.type === "STATE" && parent && parent.type !== "COUNTRY") {
    throw new Error("A state's parent must be the country");
  }

  const slug = slugify(name) || "place";
  const path = `${parent?.path ?? ""}/${slug}`;
  const existing = await db.location.findUnique({ where: { path }, select: { id: true } });
  if (existing) throw new Error(`${name} already exists here`);

  const row = await db.location.create({
    data: {
      name,
      slug,
      type: input.type,
      parentId: parent?.id ?? null,
      path,
      ancestorIds: parent ? [...parent.ancestorIds, parent.id] : [],
      clusterKey: input.clusterKey?.trim() || null,
    },
    select: { id: true },
  });
  revalidateLocation(row.id, "immediate");
  return row;
}

export async function updateLocation(
  id: string,
  input: { name?: string; isActive?: boolean; clusterKey?: string | null },
) {
  await db.location.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.clusterKey !== undefined ? { clusterKey: input.clusterKey?.trim() || null } : {}),
    },
  });
  revalidateLocation(id, "immediate");
}
