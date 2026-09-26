"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { signIn as authSignIn, signOut as authSignOut } from "@/lib/auth/config";
import {
  credentialsSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
} from "@/lib/validation/auth";
import { accountStepSchema } from "@/lib/validation/onboarding";
import { verifyOtp } from "@/lib/otp/challenge";
import {
  registerUser,
  requestPasswordReset,
  resetPassword,
  sendVerificationEmail,
} from "@/server/services/auth.service";
import { checkRateLimit, getClientIp, peekRateLimit } from "@/lib/ratelimit";

/**
 * Authentication Server Actions.
 *
 * ── Every action authorises and rate-limits itself ───────────────────────────
 * A Server Action is a POST endpoint. Nothing about being rendered inside a
 * form protects it: an attacker calls it directly with a crafted request. So
 * each action below validates its own input and consumes its own rate-limit
 * token, rather than trusting anything about how it was reached.
 *
 * ── Errors are returned, not thrown ──────────────────────────────────────────
 * These feed `useActionState`, so the shape is a plain object the form can
 * render. Throwing would surface the framework error overlay in development and
 * a generic 500 in production, neither of which tells a user their password was
 * wrong.
 */

export type ActionState = {
  ok?: boolean;
  error?: string;
  /** Per-field messages, keyed by input name. */
  fieldErrors?: Record<string, string>;
  message?: string;
  /**
   * Set when the email or phone already has a Bzaro account — typically a
   * buyer who now wants to sell. One person, one account (D39): they sign in
   * and add a business to it; the form links straight there.
   */
  existingAccount?: boolean;
};

async function clientIp(): Promise<string> {
  return getClientIp(await headers());
}

/** Flatten a Zod error into field messages the form can render inline. */
function fieldErrorsFrom(issues: Array<{ path: PropertyKey[]; message: string }>) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

export async function loginAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Enter your email address and password." };
  }

  // Failures count, successes do not (see peekRateLimit): the bucket is
  // consumed only after a wrong password below.
  const ip = await clientIp();
  const limit = await peekRateLimit("login", ip);
  if (!limit.success) {
    return { error: "Too many attempts. Try again in a little while." };
  }

  // `next` is a caller-supplied redirect target, so it must be constrained to a
  // relative path. Without this check, `?next=https://evil.test` turns the
  // login form into an open redirect that borrows our domain's credibility.
  const requested = String(formData.get("next") ?? "");
  const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/dashboard";

  try {
    await authSignIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: next,
    });
  } catch (error) {
    // Auth.js signals a successful redirect by throwing. Rethrow so Next can
    // perform it; anything else is a genuine failure.
    if (error instanceof AuthError) {
      await checkRateLimit("login", ip);
      // Deliberately uniform. Distinguishing "no such account" from "wrong
      // password" turns this form into an account-enumeration oracle.
      return { error: "Email address or password is incorrect." };
    }
    throw error;
  }

  return { ok: true };
}

export async function registerAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = accountStepSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    whatsapp: formData.get("whatsapp") ?? undefined,
    otpCode: formData.get("otpCode") ?? undefined,
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    acceptTerms: formData.get("acceptTerms") === "on",
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const limit = await checkRateLimit("register", await clientIp());
  if (!limit.success) {
    return { error: "Too many sign-ups from this network. Try again later." };
  }

  // The mobile OTP is verified in the same submission when a code was typed.
  // Without one the account is still created — with the phone unverified —
  // and the dashboard checklist keeps asking until it is (D2 rule).
  let phoneVerified = false;
  if (parsed.data.otpCode) {
    const otp = await verifyOtp({
      phone: parsed.data.phone,
      purpose: "SELLER_SIGNUP",
      code: parsed.data.otpCode,
    });
    if (!otp.ok) {
      return {
        fieldErrors: {
          otpCode:
            otp.reason === "mismatch"
              ? "That code isn't right."
              : "That code has expired or was used. Request a new one.",
        },
      };
    }
    phoneVerified = true;
  }

  const result = await registerUser({
    name: parsed.data.name,
    email: parsed.data.email,
    password: parsed.data.password,
    phone: parsed.data.phone,
    whatsapp: parsed.data.whatsapp,
    phoneVerified,
  });

  if (!result.ok) {
    // An existing address is the one case where we cannot avoid being
    // informative — the user genuinely needs to know to sign in instead.
    const field = result.reason === "phone_taken" ? "phone" : "email";
    return {
      existingAccount: true,
      fieldErrors: {
        [field]:
          field === "phone"
            ? "This mobile number already has a Bzaro account."
            : "This email already has a Bzaro account.",
      },
    };
  }

  // Straight into onboarding. The mobile number is the seller's identity
  // (D28); the confirmation email is a background nicety, not a gate —
  // sending a new seller off to their inbox at step 1 lost most of them.
  try {
    await authSignIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/register/business",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { ok: true, message: "Account created. Sign in to register your business." };
    }
    throw error; // the redirect
  }

  return { ok: true, message: "Account created." };
}

export async function requestPasswordResetAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = passwordResetRequestSchema.safeParse({ email: formData.get("email") });

  if (!parsed.success) {
    return { fieldErrors: { email: "Enter a valid email address." } };
  }

  const limit = await checkRateLimit("passwordReset", await clientIp());
  if (!limit.success) {
    return { error: "Too many requests. Try again in a little while." };
  }

  await requestPasswordReset(parsed.data.email);

  // Always the same response, whether or not the address exists. This endpoint
  // is unauthenticated and world-reachable; reporting existence would make it
  // an enumeration oracle.
  return {
    ok: true,
    message: "If that address has an account, we've sent a reset link.",
  };
}

export async function resetPasswordAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = passwordResetSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const result = await resetPassword(parsed.data.token, parsed.data.password);

  if (!result.ok) {
    return {
      error:
        result.reason === "expired"
          ? "That reset link has expired. Request a new one."
          : "That reset link is not valid. Request a new one.",
    };
  }

  return { ok: true, message: "Password updated. You can sign in now." };
}

export async function resendVerificationAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email) return { error: "Enter your email address." };

  const limit = await checkRateLimit("passwordReset", await clientIp());
  if (!limit.success) {
    return { error: "Too many requests. Try again in a little while." };
  }

  await sendVerificationEmail(email);

  return { ok: true, message: "If that address needs confirming, we've sent a new link." };
}

export async function signOutAction(): Promise<void> {
  await authSignOut({ redirect: false });
  redirect("/");
}
