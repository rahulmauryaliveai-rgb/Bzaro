"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission, requireSeller } from "@/lib/auth/guards";
import { setSetting } from "@/lib/settings";
import { BILLING_SETTINGS_KEY, billingSettingsSchema } from "@/lib/validation/billing-settings";
import { changeSellerPlan } from "@/server/services/plan.service";

/**
 * Billing actions (decision D32). There is no payment gateway yet, so the
 * seller side only *asks* and the admin side *assigns*. Both leave an audit
 * row, which is the entire paper trail until invoices exist.
 */

const planKey = z.string().trim().min(1).max(40);

/** Seller: tell the platform team which plan they want. */
export async function requestUpgradeAction(formData: FormData): Promise<void> {
  const scope = await requireSeller();
  const parsed = planKey.safeParse(formData.get("plan"));
  if (!parsed.success) return;

  const plan = await db.plan.findUnique({
    where: { key: parsed.data },
    select: { key: true, name: true, isActive: true },
  });
  if (!plan?.isActive) return;

  await db.auditLog.create({
    data: {
      actorId: scope.userId,
      sellerId: scope.sellerId,
      action: "subscription.upgrade_requested",
      entityType: "Seller",
      entityId: scope.sellerId,
      after: { plan: plan.key },
    },
  });

  revalidatePath("/dashboard/billing");
}

/** Admin: put a seller on a plan. Recomputes web presence (D32). */
export async function changePlanAction(formData: FormData): Promise<void> {
  const user = await requirePermission("admin:subscription:manage");
  const parsed = z
    .object({ sellerId: z.string().min(1), planId: z.string().min(1) })
    .safeParse({ sellerId: formData.get("sellerId"), planId: formData.get("planId") });
  if (!parsed.success) return;

  await changeSellerPlan({
    sellerId: parsed.data.sellerId,
    planId: parsed.data.planId,
    actorId: user.id,
  });

  revalidatePath(`/admin/sellers/${parsed.data.sellerId}`);
}

/** Admin: the payment instructions shown on the upgrade page. */
export async function updateBillingSettingsAction(formData: FormData): Promise<void> {
  const user = await requirePermission("admin:settings:manage");

  const parsed = billingSettingsSchema.safeParse({
    supportWhatsapp: formData.get("supportWhatsapp") ?? "",
    supportEmail: formData.get("supportEmail") ?? "",
    upiId: formData.get("upiId") ?? "",
    instructions: formData.get("instructions") ?? "",
  });
  if (!parsed.success) return;

  await setSetting(BILLING_SETTINGS_KEY, billingSettingsSchema, parsed.data);

  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: "settings.billing.update",
      after: parsed.data,
    },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/dashboard/billing");
}
