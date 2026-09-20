"use server";

import { headers } from "next/headers";
import { checkRateLimit, getClientIp, hashIp } from "@/lib/ratelimit";
import { requestOtpSchema, verifyOtpSchema } from "@/lib/validation/otp";
import { issueOtp, verifyOtp } from "@/lib/otp/challenge";
import { readBuyerIdFromCookie, setBuyerCookie } from "@/lib/buyer/cookie";
import { getBuyerSession, upsertBuyerFromOtp } from "@/server/services/buyer.service";

/**
 * OTP request / verify for the buyer contact flow (docs/LEADS.md §1).
 *
 * Both actions are reachable from tenant subdomains as well as the
 * marketplace — `serverActions.allowedOrigins` covers `*.<root domain>` —
 * and both are rate limited before they touch the database or the provider.
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
  /** Prefill for the requirement step. */
  buyer?: { name: string | null; locationId: string | null };
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
    consent: formData.get("consent") ?? undefined,
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const { phone, purpose, code, consent } = parsed.data;

  if (purpose === "BUYER_CONTACT" && !consent) {
    return { fieldErrors: { consent: "Please agree to share your requirement to continue." } };
  }

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

  if (purpose !== "BUYER_CONTACT") {
    // Seller signup verification lands in Phase 6; the challenge is consumed
    // either way so the code cannot be replayed there.
    return { ok: true };
  }

  const buyer = await upsertBuyerFromOtp(phone);
  if (buyer.isBlocked) {
    return { error: "This number can't be used to contact suppliers." };
  }

  await setBuyerCookie(buyer.id);

  return { ok: true, buyer: { name: buyer.name, locationId: buyer.locationId } };
}

export type BuyerSessionState = {
  buyer: { name: string | null; locationId: string | null } | null;
};

/**
 * Whether the visitor already holds a valid buyer cookie. Called when the
 * contact modal opens, so the public pages that mount it stay cacheable
 * (reading cookies during render would make them dynamic).
 */
export async function resolveBuyerSessionAction(): Promise<BuyerSessionState> {
  const buyerId = await readBuyerIdFromCookie();
  if (!buyerId) return { buyer: null };

  const buyer = await getBuyerSession(buyerId);
  if (!buyer || buyer.isBlocked) return { buyer: null };

  return { buyer: { name: buyer.name, locationId: buyer.locationId } };
}
