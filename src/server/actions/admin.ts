"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/guards";
import {
  moderateProduct,
  reinstateSeller,
  rejectSeller,
  suspendSeller,
  verifySeller,
} from "@/server/services/admin.service";
import { db } from "@/lib/db";
import { applyTemplate } from "@/server/services/seller.service";
import {
  indexEligibilityRulesSchema,
  INDEX_ELIGIBILITY_SETTING_KEY,
} from "@/lib/validation/index-eligibility";

/**
 * Admin Server Actions.
 *
 * Each one names the specific permission it needs rather than checking for
 * "an admin". That is what makes the SUPPORT and MODERATOR roles meaningful:
 * a moderator can suspend a seller for content but cannot verify one, and the
 * distinction is enforced here rather than only hidden in the navigation.
 */

const sellerAction = z.object({
  sellerId: z.string().cuid(),
  note: z.string().trim().max(1000).optional(),
});

export async function verifySellerAction(formData: FormData): Promise<void> {
  const user = await requirePermission("admin:seller:verify");

  const parsed = sellerAction.safeParse({
    sellerId: formData.get("sellerId"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return;

  await verifySeller({
    sellerId: parsed.data.sellerId,
    actorId: user.id,
    note: parsed.data.note,
  });

  revalidatePath("/admin/sellers");
  revalidatePath(`/admin/sellers/${parsed.data.sellerId}`);
}

export async function rejectSellerAction(formData: FormData): Promise<void> {
  const user = await requirePermission("admin:seller:verify");

  const parsed = z
    .object({
      sellerId: z.string().cuid(),
      // A rejection without a reason is not actionable for the seller, and
      // generates a support ticket every single time.
      reason: z.string().trim().min(10, "Explain why").max(1000),
    })
    .safeParse({
      sellerId: formData.get("sellerId"),
      reason: formData.get("reason"),
    });

  if (!parsed.success) return;

  await rejectSeller({
    sellerId: parsed.data.sellerId,
    actorId: user.id,
    reason: parsed.data.reason,
  });

  revalidatePath("/admin/sellers");
}

export async function suspendSellerAction(formData: FormData): Promise<void> {
  const user = await requirePermission("admin:seller:suspend");

  const parsed = z
    .object({
      sellerId: z.string().cuid(),
      reason: z.string().trim().min(5).max(1000),
      ban: z.boolean().optional(),
    })
    .safeParse({
      sellerId: formData.get("sellerId"),
      reason: formData.get("reason"),
      ban: formData.get("ban") === "on",
    });

  if (!parsed.success) return;

  await suspendSeller({
    sellerId: parsed.data.sellerId,
    actorId: user.id,
    reason: parsed.data.reason,
    ban: parsed.data.ban,
  });

  revalidatePath("/admin/sellers");
  revalidatePath(`/admin/sellers/${parsed.data.sellerId}`);
}

export async function reinstateSellerAction(formData: FormData): Promise<void> {
  const user = await requirePermission("admin:seller:suspend");

  const parsed = sellerAction.safeParse({ sellerId: formData.get("sellerId") });
  if (!parsed.success) return;

  await reinstateSeller({ sellerId: parsed.data.sellerId, actorId: user.id });

  revalidatePath("/admin/sellers");
  revalidatePath(`/admin/sellers/${parsed.data.sellerId}`);
}

export async function moderateProductAction(formData: FormData): Promise<void> {
  const user = await requirePermission("admin:content:moderate");

  const parsed = z
    .object({
      productId: z.string().cuid(),
      approve: z.boolean(),
      note: z.string().trim().max(1000).optional(),
    })
    .safeParse({
      productId: formData.get("productId"),
      approve: formData.get("decision") === "approve",
      note: formData.get("note") || undefined,
    });

  if (!parsed.success) return;

  await moderateProduct({
    productId: parsed.data.productId,
    actorId: user.id,
    approve: parsed.data.approve,
    note: parsed.data.note,
  });

  revalidatePath("/admin/moderation");
}

/**
 * Update the index-eligibility rules (decision D2).
 *
 * These are stored as data precisely so they can be tuned the same afternoon
 * Search Console complains, without a deploy. The whole ruleset is validated
 * before it is written — a malformed row would otherwise silently fall back to
 * defaults and nobody would notice the setting had stopped applying.
 */
/** Admin: switch a seller's website template (D33). */
export async function adminSetTemplateAction(formData: FormData): Promise<void> {
  const user = await requirePermission("admin:seller:website");
  const parsed = z
    .object({ sellerId: z.string().min(1), templateKey: z.string().min(1).max(40) })
    .safeParse({ sellerId: formData.get("sellerId"), templateKey: formData.get("templateKey") });
  if (!parsed.success) return;

  const seller = await db.seller.findUnique({
    where: { id: parsed.data.sellerId },
    select: { slug: true, website: { select: { template: { select: { key: true } } } } },
  });
  if (!seller) return;

  await applyTemplate(parsed.data.sellerId, seller.slug, parsed.data.templateKey);
  await db.auditLog.create({
    data: {
      actorId: user.id,
      sellerId: parsed.data.sellerId,
      action: "website.template_changed",
      entityType: "Seller",
      entityId: parsed.data.sellerId,
      before: { template: seller.website?.template.key ?? null },
      after: { template: parsed.data.templateKey },
    },
  });
  revalidatePath(`/admin/sellers/${parsed.data.sellerId}`);
}

export async function updateIndexEligibilityAction(formData: FormData): Promise<void> {
  const user = await requirePermission("admin:settings:manage");

  const parsed = indexEligibilityRulesSchema.safeParse({
    requireVerifiedSeller: formData.get("requireVerifiedSeller") === "on",
    requireVerifiedPhone: formData.get("requireVerifiedPhone") === "on",
    requireActiveStatus: formData.get("requireActiveStatus") === "on",
    requirePublishedWebsite: formData.get("requirePublishedWebsite") === "on",
    requireLogoOrCoverImage: formData.get("requireLogoOrCoverImage") === "on",
    requireLocation: formData.get("requireLocation") === "on",
    requireContactMethod: formData.get("requireContactMethod") === "on",
    requireAddress: formData.get("requireAddress") === "on",
    requireModerationClear: formData.get("requireModerationClear") === "on",
    minBusinessNameLength: Number(formData.get("minBusinessNameLength") ?? 3),
    minDescriptionLength: Number(formData.get("minDescriptionLength") ?? 150),
    minPublishedProducts: Number(formData.get("minPublishedProducts") ?? 3),
    minPublishedServices: Number(formData.get("minPublishedServices") ?? 2),
    minProfileScore: Number(formData.get("minProfileScore") ?? 60),
  });

  if (!parsed.success) return;

  await db.setting.upsert({
    where: { key: INDEX_ELIGIBILITY_SETTING_KEY },
    create: { key: INDEX_ELIGIBILITY_SETTING_KEY, value: parsed.data },
    update: { value: parsed.data },
  });

  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: "settings.index_eligibility.update",
      after: parsed.data,
    },
  });

  // Existing sellers are NOT recomputed here. Re-evaluating every seller
  // synchronously would block the request and invalidate thousands of caches at
  // once; the nightly recompute-indexability job picks the new rules up.
  revalidatePath("/admin/settings");
}
