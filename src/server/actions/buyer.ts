"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { signIn } from "@/lib/auth/config";
import { checkRateLimit, getClientIp, hashIp } from "@/lib/ratelimit";
import { verifyTurnstile } from "@/lib/turnstile";
import {
  buyerPhoneSchema,
  buyerSignupSchema,
  emailOtpVerifySchema,
  passwordResetOtpSchema,
  passwordResetRequestSchema,
} from "@/lib/validation/auth";
import { issueEmailOtp } from "@/lib/otp/email-challenge";
import {
  confirmBuyerEmail,
  registerBuyer,
  requestPasswordResetOtp,
  resetPasswordWithOtp,
  setBuyerPhone,
} from "@/server/services/auth.service";
import { getBuyerSession } from "@/server/services/buyer.service";

/**
 * Buyer authentication (D35).
 *
 * Every action authorises and rate-limits itself: a Server Action is a POST
 * endpoint, and nothing about being rendered inside a modal protects it.
 *
 * Error copy never reveals whether an address has an account. "We've sent a
 * code if that address has an account" is the same response either way,
 * because this endpoint is unauthenticated and world-reachable.
 */

export type BuyerAuthState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Drives which step the modal shows next. */
  step?: "otp" | "done";
  /** Echoed back so the verify step posts the same address. */
  email?: string;
  attemptsRemaining?: number;
};

function fieldErrorsFrom(issues: Array<{ path: PropertyKey[]; message: string }>) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

export type BuyerSessionState = {
  buyer: { name: string | null; locationId: string | null } | null;
};

/**
 * Whether a buyer is signed in, and what to pre-fill the requirement form
 * with. Called when the contact modal opens rather than during render, so the
 * public pages that mount it stay cacheable.
 */
export async function resolveBuyerSessionAction(): Promise<BuyerSessionState> {
  const buyer = await getBuyerSession();
  if (!buyer || buyer.isBlocked) return { buyer: null };

  return { buyer: { name: buyer.name, locationId: buyer.locationId } };
}

export async function buyerSignupAction(
  _previous: BuyerAuthState,
  formData: FormData,
): Promise<BuyerAuthState> {
  const parsed = buyerSignupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    password: formData.get("password"),
    acceptTerms: formData.get("acceptTerms") === "on" ? true : formData.get("acceptTerms"),
    turnstileToken: formData.get("cf-turnstile-response") ?? undefined,
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const ip = getClientIp(await headers());

  const limit = await checkRateLimit("register", ip);
  if (!limit.success) {
    return { error: "Too many sign-ups from this connection. Please try again later." };
  }

  const captcha = await verifyTurnstile(parsed.data.turnstileToken, ip);
  if (!captcha.ok) {
    return { error: "We couldn't verify that you're human. Please try again." };
  }

  const result = await registerBuyer({
    name: parsed.data.name,
    email: parsed.data.email,
    phone: parsed.data.phone,
    password: parsed.data.password,
    ipHash: hashIp(ip),
  });

  if (!result.ok) {
    return result.reason === "email_taken"
      ? { fieldErrors: { email: "An account with this email already exists. Sign in instead." } }
      : { fieldErrors: { phone: "That number is already on another account." } };
  }

  if (!result.codeSent) {
    return { error: "We couldn't send your code. Please try again in a moment." };
  }

  return { ok: true, step: "otp", email: parsed.data.email };
}

export async function verifyBuyerEmailAction(
  _previous: BuyerAuthState,
  formData: FormData,
): Promise<BuyerAuthState> {
  const parsed = emailOtpVerifySchema.safeParse({
    email: formData.get("email"),
    code: formData.get("code"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const limit = await checkRateLimit("emailOtpVerify", parsed.data.email);
  if (!limit.success) {
    return { error: "Too many attempts. Please request a new code later." };
  }

  const result = await confirmBuyerEmail(parsed.data.email, parsed.data.code);

  if (!result.ok) {
    switch (result.reason) {
      case "expired":
        return { error: "That code has expired. Request a new one.", email: parsed.data.email };
      case "locked":
        return {
          error: "Too many wrong attempts. Request a new code.",
          email: parsed.data.email,
          attemptsRemaining: 0,
        };
      case "mismatch":
        return {
          fieldErrors: { code: "That code isn't right." },
          email: parsed.data.email,
          attemptsRemaining: result.attemptsRemaining,
        };
      default:
        return { error: "That code isn't valid. Request a new one.", email: parsed.data.email };
    }
  }

  return { ok: true, step: "done", email: parsed.data.email };
}

export async function resendBuyerCodeAction(
  _previous: BuyerAuthState,
  formData: FormData,
): Promise<BuyerAuthState> {
  const parsed = passwordResetRequestSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const ip = getClientIp(await headers());
  const [emailLimit, ipLimit] = await Promise.all([
    checkRateLimit("emailOtp", parsed.data.email),
    checkRateLimit("emailOtpIp", ip),
  ]);
  if (!emailLimit.success || !ipLimit.success) {
    return { error: "Too many codes requested. Please wait a while and try again." };
  }

  const issued = await issueEmailOtp({
    email: parsed.data.email,
    purpose: "SIGNUP",
    ipHash: hashIp(ip),
  });

  if (!issued.ok) {
    return issued.reason === "cooldown"
      ? { error: "Hold on a moment before asking for another code.", email: parsed.data.email }
      : { error: "We couldn't send your code. Please try again.", email: parsed.data.email };
  }

  return { ok: true, step: "otp", email: parsed.data.email };
}

/**
 * Sign in with email and password. Wraps Auth.js `signIn` so the modal gets a
 * renderable error instead of a redirect.
 */
export async function buyerLoginAction(
  _previous: BuyerAuthState,
  formData: FormData,
): Promise<BuyerAuthState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const ip = getClientIp(await headers());
  const limit = await checkRateLimit("login", ip);
  if (!limit.success) {
    return { error: "Too many attempts. Please try again later." };
  }

  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch {
    // Uniform copy: distinguishing "no such user" from "wrong password" turns
    // this into an account-enumeration oracle.
    return { error: "That email and password don't match." };
  }

  return { ok: true, step: "done" };
}

export async function requestBuyerPasswordResetAction(
  _previous: BuyerAuthState,
  formData: FormData,
): Promise<BuyerAuthState> {
  const parsed = passwordResetRequestSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const ip = getClientIp(await headers());
  const limit = await checkRateLimit("passwordReset", ip);
  if (!limit.success) {
    return { error: "Too many requests. Please try again later." };
  }

  await requestPasswordResetOtp(parsed.data.email, hashIp(ip));

  // Always the same answer, whether or not that address has an account.
  return { ok: true, step: "otp", email: parsed.data.email };
}

export async function resetBuyerPasswordAction(
  _previous: BuyerAuthState,
  formData: FormData,
): Promise<BuyerAuthState> {
  const parsed = passwordResetOtpSchema.safeParse({
    email: formData.get("email"),
    code: formData.get("code"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const limit = await checkRateLimit("emailOtpVerify", parsed.data.email);
  if (!limit.success) return { error: "Too many attempts. Please request a new code later." };

  const result = await resetPasswordWithOtp({
    email: parsed.data.email,
    code: parsed.data.code,
    password: parsed.data.password,
  });

  if (!result.ok) {
    return result.reason === "mismatch"
      ? {
          fieldErrors: { code: "That code isn't right." },
          email: parsed.data.email,
          attemptsRemaining: result.attemptsRemaining,
        }
      : { error: "That code isn't valid. Request a new one.", email: parsed.data.email };
  }

  return { ok: true, step: "done" };
}

/** The one-time phone step after a Google sign-in. */
export async function setBuyerPhoneAction(
  _previous: BuyerAuthState,
  formData: FormData,
): Promise<BuyerAuthState> {
  const buyer = await getBuyerSession();
  if (!buyer) return { error: "Please sign in again." };

  const parsed = buyerPhoneSchema.safeParse({ phone: formData.get("phone") });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const result = await setBuyerPhone(buyer.id, parsed.data.phone);
  if (!result.ok) {
    return { fieldErrors: { phone: "That number is already on another account." } };
  }

  return { ok: true, step: "done" };
}

/**
 * Start Google sign-in.
 *
 * Sends the buyer to `/account/phone` afterwards: Google gives us an email and
 * a name but never a phone number, and a seller's whole reason to answer a lead
 * is a number to call. That page asks once and then gets out of the way.
 */
export async function buyerGoogleSignInAction(): Promise<void> {
  await signIn("google", { redirectTo: "/account/phone" });
}

/**
 * Save or unsave a seller (Phase 7).
 *
 * One action for both directions: the button reflects current state, and a
 * double-tap should land on the obvious result rather than erroring. Keyed on
 * the composite primary key, so it is idempotent by construction.
 */
export async function toggleSavedSellerAction(
  _previous: BuyerAuthState,
  formData: FormData,
): Promise<BuyerAuthState & { saved?: boolean }> {
  const buyer = await getBuyerSession();
  if (!buyer) return { error: "Sign in to save suppliers." };

  const sellerId = String(formData.get("sellerId") ?? "");
  if (!sellerId) return { error: "Choose a supplier." };

  const seller = await db.seller.findFirst({
    where: { id: sellerId, status: "VERIFIED", deletedAt: null },
    select: { id: true },
  });
  if (!seller) return { error: "That supplier isn't available." };

  const existing = await db.savedSeller.findUnique({
    where: { buyerId_sellerId: { buyerId: buyer.id, sellerId: seller.id } },
    select: { buyerId: true },
  });

  if (existing) {
    await db.savedSeller.delete({
      where: { buyerId_sellerId: { buyerId: buyer.id, sellerId: seller.id } },
    });
    revalidatePath("/account/saved");
    return { ok: true, saved: false };
  }

  await db.savedSeller.create({ data: { buyerId: buyer.id, sellerId: seller.id } });
  revalidatePath("/account/saved");
  return { ok: true, saved: true };
}

/** Whether the signed-in buyer has saved this seller. Null when signed out. */
export async function isSellerSavedAction(sellerId: string): Promise<boolean | null> {
  const buyer = await getBuyerSession();
  if (!buyer) return null;

  const row = await db.savedSeller.findUnique({
    where: { buyerId_sellerId: { buyerId: buyer.id, sellerId } },
    select: { buyerId: true },
  });
  return Boolean(row);
}
