"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guards";
import {
  createCategory,
  createLocation,
  updateCategory,
  updateLocation,
} from "@/server/services/admin-taxonomy.service";
import { revalidateHome } from "@/lib/cache/revalidate";

/**
 * Admin taxonomy actions. Plain FormData → Zod → service, like the rest of
 * src/server/actions/admin.ts. Every write leaves an audit row.
 */

const id = z.string().min(1).max(40);
const name = z.string().trim().min(2, "Enter a name").max(80);
const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .transform((value) => (value.length === 0 ? null : value))
  .refine((value) => value === null || /^https?:\/\//.test(value), "Must be an http(s) URL");

async function audit(actorId: string, action: string, entityId: string, after: unknown) {
  await db.auditLog.create({
    data: { actorId, action, entityType: "Taxonomy", entityId, after: after as object },
  });
}

export async function createCategoryAction(formData: FormData): Promise<void> {
  const user = await requirePermission("admin:taxonomy:manage");
  const parsed = z
    .object({ name, parentId: z.string().max(40).optional() })
    .safeParse({ name: formData.get("name"), parentId: formData.get("parentId") ?? undefined });
  if (!parsed.success) return;

  const row = await createCategory({
    name: parsed.data.name,
    parentId: parsed.data.parentId || null,
  });
  await audit(user.id, "category.create", row.id, parsed.data);
  revalidateHome("immediate");
  revalidatePath("/admin/categories");
}

export async function updateCategoryAction(formData: FormData): Promise<void> {
  const user = await requirePermission("admin:taxonomy:manage");
  const parsed = z
    .object({
      id,
      name: name.optional(),
      imageUrl: optionalUrl.optional(),
      sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
    })
    .safeParse({
      id: formData.get("id"),
      name: formData.get("name") ?? undefined,
      imageUrl: formData.get("imageUrl") ?? undefined,
      sortOrder: formData.get("sortOrder") ?? undefined,
    });
  if (!parsed.success) return;

  const { id: categoryId, ...rest } = parsed.data;
  await updateCategory(categoryId, rest);
  await audit(user.id, "category.update", categoryId, rest);
  revalidatePath("/admin/categories");
}

export async function toggleCategoryAction(formData: FormData): Promise<void> {
  const user = await requirePermission("admin:taxonomy:manage");
  const parsed = z
    .object({ id, isActive: z.enum(["0", "1"]) })
    .safeParse({ id: formData.get("id"), isActive: formData.get("isActive") });
  if (!parsed.success) return;

  await updateCategory(parsed.data.id, { isActive: parsed.data.isActive === "1" });
  await audit(user.id, "category.toggle", parsed.data.id, {
    isActive: parsed.data.isActive === "1",
  });
  revalidateHome("immediate");
  revalidatePath("/admin/categories");
}

export async function createLocationAction(formData: FormData): Promise<void> {
  const user = await requirePermission("admin:taxonomy:manage");
  const parsed = z
    .object({
      name,
      parentId: z.string().max(40).optional(),
      type: z.enum(["STATE", "CITY"]),
      clusterKey: z.string().trim().max(40).optional(),
    })
    .safeParse({
      name: formData.get("name"),
      parentId: formData.get("parentId") ?? undefined,
      type: formData.get("type"),
      clusterKey: formData.get("clusterKey") ?? undefined,
    });
  if (!parsed.success) return;

  const row = await createLocation({
    name: parsed.data.name,
    parentId: parsed.data.parentId || null,
    type: parsed.data.type,
    clusterKey: parsed.data.clusterKey,
  });
  await audit(user.id, "location.create", row.id, parsed.data);
  revalidateHome("immediate");
  revalidatePath("/admin/locations");
}

export async function updateLocationAction(formData: FormData): Promise<void> {
  const user = await requirePermission("admin:taxonomy:manage");
  const parsed = z
    .object({
      id,
      name: name.optional(),
      clusterKey: z.string().trim().max(40).optional(),
      isActive: z.enum(["0", "1"]).optional(),
    })
    .safeParse({
      id: formData.get("id"),
      name: formData.get("name") ?? undefined,
      clusterKey: formData.get("clusterKey") ?? undefined,
      isActive: formData.get("isActive") ?? undefined,
    });
  if (!parsed.success) return;

  const { id: locationId, isActive, ...rest } = parsed.data;
  await updateLocation(locationId, {
    ...rest,
    ...(isActive !== undefined ? { isActive: isActive === "1" } : {}),
  });
  await audit(user.id, "location.update", locationId, parsed.data);
  revalidateHome("immediate");
  revalidatePath("/admin/locations");
}
