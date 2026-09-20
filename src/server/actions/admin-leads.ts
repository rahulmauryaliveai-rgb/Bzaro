"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { adjustCreditsSchema, resolveFlagSchema } from "@/lib/validation/lead";
import { adjustCredits, refundForFlag } from "@/server/services/credit.service";

/**
 * Admin lead actions: resolve a seller's flag (refund or reject) and adjust
 * credits by hand. Both are audit-logged — a credit is money-adjacent, and
 * "who gave this seller 20 credits" must have an answer.
 */

export async function resolveFlagAction(formData: FormData): Promise<void> {
  const user = await requirePermission("admin:lead:refund");

  const parsed = resolveFlagSchema.safeParse({
    flagId: formData.get("flagId"),
    decision: formData.get("decision"),
    reviewNote: formData.get("reviewNote") ?? undefined,
  });
  if (!parsed.success) return;

  const { flagId, decision, reviewNote } = parsed.data;

  if (decision === "REFUNDED") {
    const result = await refundForFlag({ flagId, actorId: user.id, reviewNote });
    if (!result.ok && result.reason === "nothing_to_refund") {
      // Flag on a lead that never cost anything (DIRECT, or never accepted):
      // record the review without a ledger entry.
      await db.leadFlag.updateMany({
        where: { id: flagId, status: "OPEN" },
        data: {
          status: "REJECTED",
          reviewedById: user.id,
          reviewedAt: new Date(),
          reviewNote: reviewNote ?? "No credit was charged for this lead.",
        },
      });
    }
  } else {
    await db.leadFlag.updateMany({
      where: { id: flagId, status: "OPEN" },
      data: {
        status: "REJECTED",
        reviewedById: user.id,
        reviewedAt: new Date(),
        reviewNote: reviewNote ?? null,
      },
    });
  }

  await db.auditLog.create({
    data: {
      actorId: user.id,
      actorRole: user.role,
      action: `lead.flag.${decision.toLowerCase()}`,
      entityType: "LeadFlag",
      entityId: flagId,
      after: { decision, reviewNote: reviewNote ?? null },
    },
  });

  revalidatePath("/admin/leads/flags");
}

export type AdjustCreditsState = { ok?: boolean; error?: string; balanceAfter?: number };

export async function adjustCreditsAction(
  _previous: AdjustCreditsState,
  formData: FormData,
): Promise<AdjustCreditsState> {
  const user = await requirePermission("admin:credit:adjust");

  const parsed = adjustCreditsSchema.safeParse({
    sellerId: formData.get("sellerId"),
    delta: formData.get("delta"),
    note: formData.get("note"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the amount and note." };
  }

  const result = await adjustCredits({ ...parsed.data, actorId: user.id });
  if (!result.ok) return { error: "That would take the balance below zero." };

  await db.auditLog.create({
    data: {
      actorId: user.id,
      actorRole: user.role,
      sellerId: parsed.data.sellerId,
      action: "credits.adjust",
      entityType: "Seller",
      entityId: parsed.data.sellerId,
      after: {
        delta: parsed.data.delta,
        note: parsed.data.note,
        balanceAfter: result.balanceAfter,
      },
    },
  });

  revalidatePath(`/admin/sellers/${parsed.data.sellerId}`);
  return { ok: true, balanceAfter: result.balanceAfter };
}
