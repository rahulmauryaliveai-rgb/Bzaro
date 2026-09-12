"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { signIn as authSignIn, signOut as authSignOut } from "@/lib/auth/config";
import {
  credentialsSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
  registerSchema,
} from "@/lib/validation/auth";
import {
  registerUser,
  requestPasswordReset,
  resetPassword,
  sendVerificationEmail,
} from "@/server/services/auth.service";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";

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

  const limit = await checkRateLimit("login", await clientIp());
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
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
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

  const result = await registerUser({
    name: parsed.data.name,
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (!result.ok) {
    // An existing address is the one case where we cannot avoid being
    // informative — the user genuinely needs to know to sign in instead.
    return { fieldErrors: { email: "An account with this email already exists." } };
  }

  return {
    ok: true,
    message: result.emailSent
      ? "Check your inbox to confirm your email address."
      : "Account created, but we could not send the confirmation email. Try requesting it again.",
  };
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
