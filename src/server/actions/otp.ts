"use server";

import { headers } from "next/headers";
import { checkRateLimit, getClientIp, hashIp } from "@/lib/ratelimit";
import { requestOtpSchema, verifyOtpSchema } from "@/lib/validation/otp";
import { issueOtp, verifyOtp } from "@/lib/otp/challenge";

/**
 * Phone OTP request / verify. Seller onboarding only — buyers verify an email
 * address instead (see EmailOtp), so this no longer has a buyer path.
 *
 * Both actions are rate limited before they touch the database or the
 * provider.
 *
 * Error copy is deliberately uniform for "no such challenge" versus "wrong
 * code": distinguishing them tells an attacker whether a number is mid-flow.
 */

export type OtpRequestState = {
  ok?: boolean;
  /** Normalised E.164, echoed back so the verify step posts the same value. */
  phone?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
};

export type OtpVerifyState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  attemptsRemaining?: number;
};

function fieldErrorsFrom(issues: { path: PropertyKey[]; message: string }[]) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

export async function requestOtpAction(
  _previous: OtpRequestState,
  formData: FormData,
): Promise<OtpRequestState> {
  const parsed = requestOtpSchema.safeParse({
    phone: formData.get("phone"),
    purpose: formData.get("purpose"),
    website: formData.get("website"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const { phone, purpose } = parsed.data;
  const ip = getClientIp(await headers());

  // Per-IP first (cheaper to trip, protects the phone book), then per-phone
  // (protects the SMS bill and the recipient).
  const [ipLimit, phoneLimit] = await Promise.all([
    checkRateLimit("otpIp", ip),
    checkRateLimit("otp", phone),
  ]);
  if (!ipLimit.success || !phoneLimit.success) {
    return { error: "Too many codes requested. Please wait a while and try again." };
  }

  const issued = await issueOtp({ phone, purpose, ipHash: hashIp(ip) });
  if (!issued.ok) {
    return { error: "We couldn't send the code right now. Please try again." };
  }

  return { ok: true, phone };
}

export async function verifyOtpAction(
  _previous: OtpVerifyState,
  formData: FormData,
): Promise<OtpVerifyState> {
  const parsed = verifyOtpSchema.safeParse({
    phone: formData.get("phone"),
    purpose: formData.get("purpose"),
    code: formData.get("code"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const { phone, purpose, code } = parsed.data;

  const limit = await checkRateLimit("otpVerify", phone);
  if (!limit.success) {
    return { error: "Too many attempts. Please request a new code later." };
  }

  const result = await verifyOtp({ phone, purpose, code });

  if (!result.ok) {
    switch (result.reason) {
      case "expired":
        return { error: "That code has expired. Request a new one." };
      case "locked":
        return { error: "Too many wrong attempts. Request a new code.", attemptsRemaining: 0 };
      case "mismatch":
        return {
          fieldErrors: { code: "That code isn't right." },
          attemptsRemaining: result.attemptsRemaining,
        };
      default:
        return { error: "That code isn't valid. Request a new one." };
    }
  }

  return { ok: true };
}
