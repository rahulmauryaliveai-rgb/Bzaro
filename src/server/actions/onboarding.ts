"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSeller, requireUserStrict } from "@/lib/auth/guards";
import { catalogStepSchema, trustStepSchema } from "@/lib/validation/onboarding";
import { verifyOtpSchema } from "@/lib/validation/otp";
import { verifyOtp } from "@/lib/otp/challenge";
import { GSTIN_TAKEN, isUniqueViolation } from "@/lib/db-errors";
import { checkRateLimit } from "@/lib/ratelimit";
import {
  completeOnboarding,
  markUserPhoneVerified,
  saveTrustStep,
  saveThemeStep,
} from "@/server/services/onboarding.service";

/**
 * Onboarding steps 3 and 4, plus phone verification from the dashboard for
 * sellers who skipped the OTP at sign-up.
 *
 * Every action re-authorises: `requireSeller()` proves the session owns a
 * seller, and the services take that seller's id — never one from the form.
 */

export type OnboardingState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

function fieldErrorsFrom(issues: { path: PropertyKey[]; message: string }[]) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

export async function saveTrustStepAction(
  _previous: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const scope = await requireSeller();

  const parsed = trustStepSchema.safeParse({
    gstin: formData.get("gstin") ?? "",
    establishedYear: formData.get("establishedYear") ?? "",
    employeeCount: formData.get("employeeCount") ?? "",
    annualTurnover: formData.get("annualTurnover") ?? "",
    logoUrl: formData.get("logoUrl") ?? undefined,
    certifications: formData.getAll("certifications").map(String).filter(Boolean),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  try {
    await saveTrustStep(scope.sellerId, scope.sellerSlug, parsed.data);
  } catch (error) {
    // One GSTIN, one business: a duplicate is a field error, not a crash.
    if (isUniqueViolation(error, "Seller", "gstin")) {
      return { fieldErrors: { gstin: GSTIN_TAKEN } };
    }
    throw error;
  }
  redirect("/register/theme");
}

/** "Skip for now" on the trust step. */
export async function skipTrustStepAction(): Promise<void> {
  const scope = await requireSeller();
  await saveTrustStep(scope.sellerId, scope.sellerSlug, {});
  redirect("/register/theme");
}

/** Step 4 (D33): the picker posts `templateKey`; "keep default" posts none. */
export async function saveThemeStepAction(formData: FormData): Promise<void> {
  const scope = await requireSeller();
  const key = formData.get("templateKey");
  await saveThemeStep(
    scope.sellerId,
    scope.sellerSlug,
    typeof key === "string" && key ? key : null,
  );
  redirect("/register/catalog");
}

export async function finishOnboardingAction(formData: FormData): Promise<void> {
  const scope = await requireSeller();
  const parsed = catalogStepSchema.safeParse({ next: formData.get("next") ?? "dashboard" });
  await completeOnboarding(scope.sellerId);
  revalidatePath("/dashboard");
  redirect(
    parsed.success && parsed.data.next === "product"
      ? "/dashboard/products/new"
      : "/dashboard?welcome=1",
  );
}

/**
 * Verify the owner's mobile from dashboard settings. Requests go through the
 * shared requestOtpAction (purpose SELLER_SIGNUP); this consumes the code.
 */
export async function verifySellerPhoneAction(
  _previous: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const user = await requireUserStrict();

  const parsed = verifyOtpSchema.safeParse({
    phone: formData.get("phone"),
    purpose: "SELLER_SIGNUP",
    code: formData.get("otpCode"),
  });
  if (!parsed.success) {
    // The schema calls the field `code`; the form calls it `otpCode`.
    const { code, ...rest } = fieldErrorsFrom(parsed.error.issues);
    return { fieldErrors: { ...rest, ...(code ? { otpCode: code } : {}) } };
  }

  const limit = await checkRateLimit("otpVerify", parsed.data.phone);
  if (!limit.success) return { error: "Too many attempts. Please request a new code later." };

  const result = await verifyOtp({
    phone: parsed.data.phone,
    purpose: "SELLER_SIGNUP",
    code: parsed.data.code,
  });
  if (!result.ok) {
    return {
      fieldErrors: {
        otpCode:
          result.reason === "mismatch"
            ? "That code isn't right."
            : "That code has expired or was used. Request a new one.",
      },
    };
  }

  const saved = await markUserPhoneVerified(user.id, parsed.data.phone);
  if (!saved) return { fieldErrors: { phone: "That number belongs to another account." } };

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
  return { ok: true };
}
