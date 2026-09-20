"use server";

import { revalidatePath } from "next/cache";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guards";
import { upsertPlan } from "@/server/services/admin-billing.service";

/**
 * Admin plan editor (D5, D32). Prices arrive in rupees from the form and are
 * stored in paise; "unlimited" credits arrive as an empty field and are
 * stored as null.
 */

const planSchema = z.object({
  id: z.string().max(40).optional(),
  key: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9-]{1,30}$/, "Lowercase letters, digits and hyphens"),
  name: z.string().trim().min(2).max(60),
  description: z
    .string()
    .trim()
    .max(200)
    .transform((value) => (value.length === 0 ? null : value)),
  priceRupees: z.coerce.number().min(0).max(10_000_000),
  interval: z.enum(["MONTHLY", "QUARTERLY", "YEARLY"]),
  maxProducts: z.coerce.number().int().min(0).max(100_000),
  maxServices: z.coerce.number().int().min(0).max(100_000),
  maxGalleryItems: z.coerce.number().int().min(0).max(100_000),
  maxCategories: z.coerce.number().int().min(1).max(100),
  leadCreditsPerMonth: z
    .string()
    .trim()
    .transform((value) => (value.length === 0 ? null : Number(value)))
    .refine(
      (value) => value === null || (Number.isInteger(value) && value >= 0 && value <= 100_000),
    ),
  webPresence: z.enum(["CATALOGUE", "SUBDOMAIN", "CUSTOM_DOMAIN"]),
  allowPremiumTemplates: z.boolean(),
  removeBranding: z.boolean(),
  prioritySupport: z.boolean(),
  searchBoost: z.coerce.number().int().min(0).max(1000),
  isActive: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(999),
});

export async function savePlanAction(formData: FormData): Promise<void> {
  const user = await requirePermission("admin:plan:manage");
  const parsed = planSchema.safeParse({
    id: formData.get("id") ?? undefined,
    key: formData.get("key"),
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    priceRupees: formData.get("priceRupees"),
    interval: formData.get("interval"),
    maxProducts: formData.get("maxProducts"),
    maxServices: formData.get("maxServices"),
    maxGalleryItems: formData.get("maxGalleryItems"),
    maxCategories: formData.get("maxCategories"),
    leadCreditsPerMonth: formData.get("leadCreditsPerMonth") ?? "",
    webPresence: formData.get("webPresence"),
    allowPremiumTemplates: formData.get("allowPremiumTemplates") === "on",
    removeBranding: formData.get("removeBranding") === "on",
    prioritySupport: formData.get("prioritySupport") === "on",
    searchBoost: formData.get("searchBoost") ?? 0,
    isActive: formData.get("isActive") === "on",
    sortOrder: formData.get("sortOrder") ?? 0,
  });
  if (!parsed.success) return;

  const { id, priceRupees, ...rest } = parsed.data;
  const plan = await upsertPlan(id || null, { ...rest, priceMinor: Math.round(priceRupees * 100) });

  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: id ? "plan.update" : "plan.create",
      entityType: "Plan",
      entityId: plan.id,
      after: { ...rest, priceMinor: Math.round(priceRupees * 100) },
    },
  });

  revalidateTag("plans", "max");
  revalidatePath("/admin/plans");
  revalidatePath("/pricing");
}
