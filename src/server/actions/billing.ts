"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission, requireSeller } from "@/lib/auth/guards";
import { setSetting } from "@/lib/settings";
import { BILLING_SETTINGS_KEY, billingSettingsSchema } from "@/lib/validation/billing-settings";
import { changeSellerPlan } from "@/server/services/plan.service";
import { can } from "@/lib/auth/permissions";
import {
  cancelPlanAtPeriodEnd,
  confirmAddonCheckout,
  confirmPlanCheckout,
  startAddonCheckout,
  startPassCheckout,
  startPlanCheckout,
  type CheckoutStart,
} from "@/server/services/billing.service";
import { approveRefund, rejectRefund, requestRefund } from "@/server/services/refund.service";

/**
 * Billing actions (D32, D41).
 *
 * With Bzaro's Razorpay keys configured, sellers subscribe and buy add-ons
 * online (the checkout actions below). Without them — or for a bank transfer —
 * the manual path stays: the seller *asks*, the admin *assigns*. Every path
 * leaves an audit row.
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

/** Admin: payment instructions, D41 prices and the invoice supplier details. */
export async function updateBillingSettingsAction(formData: FormData): Promise<void> {
  const user = await requirePermission("admin:settings:manage");
  const text = (name: string) => String(formData.get(name) ?? "");
  const paise = (name: string) => Math.round(Number(formData.get(name) ?? 0) * 100);
  const int = (name: string) => Number.parseInt(String(formData.get(name) ?? ""), 10);

  const parsed = billingSettingsSchema.safeParse({
    supportWhatsapp: text("supportWhatsapp"),
    supportEmail: text("supportEmail"),
    upiId: text("upiId"),
    instructions: text("instructions"),
    gstRatePercent: Number(formData.get("gstRatePercent") ?? 18),
    leadPackPriceMinor: paise("leadPackRupees"),
    leadPackCredits: int("leadPackCredits"),
    paymentGatewayAddonMinor: paise("paymentGatewayAddonRupees"),
    shippingAddonMinor: paise("shippingAddonRupees"),
    graceDays: int("graceDays"),
    refundWindowDays: int("refundWindowDays"),
    legalName: text("legalName"),
    gstin: text("gstin").toUpperCase(),
    address: text("address"),
    state: text("state"),
    sacCode: text("sacCode"),
    invoicePrefix: text("invoicePrefix").toUpperCase(),
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

// ── D41: online checkout ─────────────────────────────────────────────────────

async function billingScope() {
  const scope = await requireSeller();
  if (!can(scope.role, "seller:billing")) return null;
  return scope;
}

const intervalSchema = z.enum(["MONTHLY", "YEARLY"]);
const addonSchema = z.enum(["LEAD_PACK", "PAYMENT_GATEWAY", "SHIPPING"]);
const gatewayId = z
  .string()
  .trim()
  .min(5)
  .max(64)
  .regex(/^[A-Za-z0-9_]+$/);
const signature = z
  .string()
  .trim()
  .min(10)
  .max(256)
  .regex(/^[a-f0-9]+$/);

const couponInput = z
  .string()
  .trim()
  .max(40)
  .nullable()
  .transform((value) => (value ? value : null));

export async function startPlanCheckoutAction(
  planKeyInput: string,
  intervalInput: string,
  couponCodeInput: string | null = null,
): Promise<CheckoutStart> {
  const scope = await billingScope();
  if (!scope) return { ok: false, error: "Only the account owner can change the plan." };
  const parsed = z
    .object({ planKey, interval: intervalSchema })
    .safeParse({ planKey: planKeyInput, interval: intervalInput });
  if (!parsed.success) return { ok: false, error: "Choose a plan." };
  const couponCode = couponInput.safeParse(couponCodeInput);
  return startPlanCheckout({
    sellerId: scope.sellerId,
    userId: scope.userId,
    ...parsed.data,
    couponCode: couponCode.success ? couponCode.data : null,
  });
}

export async function confirmPlanCheckoutAction(input: {
  subscriptionId: string;
  paymentId: string;
  signature: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const scope = await billingScope();
  if (!scope) return { ok: false, error: "Not allowed." };
  const parsed = z
    .object({ subscriptionId: gatewayId, paymentId: gatewayId, signature })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Payment response was incomplete." };
  const result = await confirmPlanCheckout({ sellerId: scope.sellerId, ...parsed.data });
  revalidatePath("/dashboard", "layout");
  return result;
}

export async function startAddonCheckoutAction(
  kindInput: string,
  couponCodeInput: string | null = null,
): Promise<CheckoutStart> {
  const scope = await billingScope();
  if (!scope) return { ok: false, error: "Only the account owner can buy add-ons." };
  const parsed = addonSchema.safeParse(kindInput);
  if (!parsed.success) return { ok: false, error: "Unknown add-on." };
  const couponCode = couponInput.safeParse(couponCodeInput);
  return startAddonCheckout({
    sellerId: scope.sellerId,
    userId: scope.userId,
    kind: parsed.data,
    couponCode: couponCode.success ? couponCode.data : null,
  });
}

/** D42: redeem a plan-pass coupon. */
export async function startPassCheckoutAction(couponCodeInput: string): Promise<CheckoutStart> {
  const scope = await billingScope();
  if (!scope) return { ok: false, error: "Only the account owner can change the plan." };
  const couponCode = couponInput.safeParse(couponCodeInput);
  if (!couponCode.success || !couponCode.data) return { ok: false, error: "Enter a coupon code." };
  const result = await startPassCheckout({
    sellerId: scope.sellerId,
    userId: scope.userId,
    couponCode: couponCode.data,
  });
  if (result.ok && "free" in result) revalidatePath("/dashboard", "layout");
  return result;
}

export async function confirmAddonCheckoutAction(input: {
  purchaseId: string;
  orderId: string;
  paymentId: string;
  signature: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const scope = await billingScope();
  if (!scope) return { ok: false, error: "Not allowed." };
  const parsed = z
    .object({
      purchaseId: z.string().min(10).max(40),
      orderId: gatewayId,
      paymentId: gatewayId,
      signature,
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Payment response was incomplete." };
  const result = await confirmAddonCheckout({ sellerId: scope.sellerId, ...parsed.data });
  revalidatePath("/dashboard", "layout");
  return result;
}

export async function cancelPlanAction(): Promise<void> {
  const scope = await billingScope();
  if (!scope) return;
  await cancelPlanAtPeriodEnd({ sellerId: scope.sellerId, userId: scope.userId });
  revalidatePath("/dashboard/billing");
}

// ── D41: refunds ─────────────────────────────────────────────────────────────

export type RefundFormState = { ok?: boolean; error?: string };

export async function requestRefundAction(
  _prev: RefundFormState,
  formData: FormData,
): Promise<RefundFormState> {
  const scope = await billingScope();
  if (!scope) return { error: "Only the account owner can request a refund." };
  const parsed = z
    .object({
      paymentId: z.string().min(10).max(40),
      reason: z.string().trim().min(3).max(200),
      details: z
        .string()
        .trim()
        .max(2000)
        .transform((value) => (value.length === 0 ? null : value)),
    })
    .safeParse({
      paymentId: formData.get("paymentId"),
      reason: formData.get("reason"),
      details: formData.get("details") ?? "",
    });
  if (!parsed.success) return { error: "Choose a reason." };
  const result = await requestRefund({
    sellerId: scope.sellerId,
    userId: scope.userId,
    ...parsed.data,
  });
  revalidatePath("/dashboard/billing");
  return result.ok ? { ok: true } : { error: result.error };
}

export async function reviewRefundAction(formData: FormData): Promise<void> {
  const user = await requirePermission("admin:subscription:manage");
  const parsed = z
    .object({
      id: z.string().min(10).max(40),
      decision: z.enum(["approve", "reject"]),
      note: z
        .string()
        .trim()
        .max(1000)
        .transform((value) => (value.length === 0 ? null : value)),
    })
    .safeParse({
      id: formData.get("id"),
      decision: formData.get("decision"),
      note: formData.get("note") ?? "",
    });
  if (!parsed.success) return;
  if (parsed.data.decision === "approve") {
    await approveRefund({ id: parsed.data.id, adminId: user.id, note: parsed.data.note });
  } else {
    await rejectRefund({ id: parsed.data.id, adminId: user.id, note: parsed.data.note });
  }
  revalidatePath("/admin/refunds");
}
