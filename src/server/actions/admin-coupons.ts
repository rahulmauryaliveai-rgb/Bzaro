"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guards";
import { COUPON_TARGETS, normaliseCouponCode } from "@/lib/billing/coupon";
import { createCoupon, setCouponActive } from "@/server/services/coupon.service";

/**
 * Admin coupon editor (D42). Money arrives in rupees and is stored in paise.
 * The shape per kind is enforced here and again by a CHECK constraint.
 */

export type CouponFormState = { ok?: boolean; error?: string };

const optionalNumber = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? null : Number(value)))
  .refine((value) => value === null || Number.isFinite(value), "Enter a number");

const optionalDate = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? null : new Date(`${value}T00:00:00+05:30`)))
  .refine((value) => value === null || !Number.isNaN(value.getTime()), "Enter a date");

const couponSchema = z.object({
  code: z.string(),
  description: z
    .string()
    .trim()
    .max(200)
    .transform((value) => (value.length === 0 ? null : value)),
  kind: z.enum(["PLAN_PASS", "PERCENT_OFF", "FLAT_OFF"]),
  planKey: z.string().trim().max(40),
  passMonths: optionalNumber,
  passPriceRupees: optionalNumber,
  percentOff: optionalNumber,
  amountOffRupees: optionalNumber,
  appliesTo: z.array(z.enum(COUPON_TARGETS)),
  planKeys: z.array(z.string().max(40)),
  startsAt: optionalDate,
  endsAt: optionalDate,
  maxRedemptions: optionalNumber,
  perSellerLimit: z.coerce.number().int().min(1).max(100),
  newSellersOnly: z.boolean(),
});

export async function createCouponAction(
  _prev: CouponFormState,
  formData: FormData,
): Promise<CouponFormState> {
  const user = await requirePermission("admin:plan:manage");
  const parsed = couponSchema.safeParse({
    code: formData.get("code") ?? "",
    description: formData.get("description") ?? "",
    kind: formData.get("kind"),
    planKey: formData.get("planKey") ?? "",
    passMonths: formData.get("passMonths") ?? "",
    passPriceRupees: formData.get("passPriceRupees") ?? "",
    percentOff: formData.get("percentOff") ?? "",
    amountOffRupees: formData.get("amountOffRupees") ?? "",
    appliesTo: formData.getAll("appliesTo").map(String),
    planKeys: formData.getAll("planKeys").map(String),
    startsAt: formData.get("startsAt") ?? "",
    endsAt: formData.get("endsAt") ?? "",
    maxRedemptions: formData.get("maxRedemptions") ?? "",
    perSellerLimit: formData.get("perSellerLimit") ?? 1,
    newSellersOnly: formData.get("newSellersOnly") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const input = parsed.data;
  const code = normaliseCouponCode(input.code);
  if (!code) return { error: "Code: 3–30 letters, digits or hyphens." };
  if (input.startsAt && input.endsAt && input.endsAt <= input.startsAt) {
    return { error: "The end date must be after the start date." };
  }
  if (
    input.maxRedemptions !== null &&
    (!Number.isInteger(input.maxRedemptions) || input.maxRedemptions < 1)
  ) {
    return { error: "Total uses must be a whole number of at least 1 (or blank for unlimited)." };
  }

  let planId: string | null = null;
  let passMonths: number | null = null;
  let passPriceMinor: number | null = null;
  let percentOff: number | null = null;
  let amountOffMinor: number | null = null;

  if (input.kind === "PLAN_PASS") {
    const plan = await db.plan.findUnique({
      where: { key: input.planKey },
      select: { id: true, priceMinor: true },
    });
    if (!plan || plan.priceMinor === 0) return { error: "Choose a paid plan for the pass." };
    if (
      !input.passMonths ||
      !Number.isInteger(input.passMonths) ||
      input.passMonths < 1 ||
      input.passMonths > 36
    ) {
      return { error: "Pass length: 1 to 36 months." };
    }
    if (input.passPriceRupees === null || input.passPriceRupees < 0) {
      return { error: "Pass price: ₹0 or more (GST included)." };
    }
    const minor = Math.round(input.passPriceRupees * 100);
    if (minor > 0 && minor < 100) return { error: "A paid pass must cost at least ₹1." };
    planId = plan.id;
    passMonths = input.passMonths;
    passPriceMinor = minor;
  } else if (input.kind === "PERCENT_OFF") {
    if (
      !input.percentOff ||
      !Number.isInteger(input.percentOff) ||
      input.percentOff < 1 ||
      input.percentOff > 100
    ) {
      return { error: "Percent off: a whole number from 1 to 100." };
    }
    percentOff = input.percentOff;
  } else {
    if (!input.amountOffRupees || input.amountOffRupees <= 0) {
      return { error: "Amount off must be more than ₹0." };
    }
    amountOffMinor = Math.round(input.amountOffRupees * 100);
  }

  const result = await createCoupon({
    code,
    description: input.description,
    kind: input.kind,
    planId,
    passMonths,
    passPriceMinor,
    percentOff,
    amountOffMinor,
    appliesTo: input.kind === "PLAN_PASS" ? [] : input.appliesTo,
    planKeys: input.kind === "PLAN_PASS" ? [] : input.planKeys,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    maxRedemptions: input.maxRedemptions,
    perSellerLimit: input.perSellerLimit,
    newSellersOnly: input.newSellersOnly,
    createdById: user.id,
  });
  if (!result.ok) return { error: result.error };

  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: "coupon.create",
      entityType: "Coupon",
      entityId: result.id,
      after: { code, kind: input.kind },
    },
  });
  revalidatePath("/admin/coupons");
  return { ok: true };
}

export async function setCouponActiveAction(formData: FormData): Promise<void> {
  const user = await requirePermission("admin:plan:manage");
  const parsed = z
    .object({ id: z.string().min(1).max(40), active: z.enum(["1", "0"]) })
    .safeParse({ id: formData.get("id"), active: formData.get("active") });
  if (!parsed.success) return;
  await setCouponActive(parsed.data.id, parsed.data.active === "1");
  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: parsed.data.active === "1" ? "coupon.activate" : "coupon.deactivate",
      entityType: "Coupon",
      entityId: parsed.data.id,
    },
  });
  revalidatePath("/admin/coupons");
}
