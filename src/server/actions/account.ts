"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUserStrict } from "@/lib/auth/guards";
import { changePassword, revokeSessions } from "@/server/services/auth.service";
import { signOut } from "@/lib/auth/config";
import { passwordSchema } from "@/lib/validation/auth";

/**
 * Account settings.
 *
 * Both actions here are privilege-reducing, so both route through the auth
 * service's `revokeSessions()` / `changePassword()`, which set
 * `User.sessionsInvalidAfter`. That column is decision D19's revocation
 * mechanism: sessions are JWT-backed, so a token already in the wild stays
 * valid until it expires unless something explicitly invalidates it.
 *
 * `docs/SECURITY.md` §3 lists every operation that must set it. Routing through
 * the service rather than updating the column here is what keeps that list
 * enforceable in one place.
 */

export type AccountState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  message?: string;
};

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password").max(200),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export async function changePasswordAction(
  _previous: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const user = await requireUserStrict();

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const result = await changePassword(
    user.id,
    parsed.data.currentPassword,
    parsed.data.password,
  );

  if (!result.ok) {
    return result.reason === "wrong_password"
      ? { fieldErrors: { currentPassword: "That password is not correct." } }
      : { error: "This account signs in with Google and has no password to change." };
  }

  return {
    ok: true,
    message: "Password changed. You've been signed out on every other device.",
  };
}

/**
 * Sign out everywhere.
 *
 * Invalidates every session including this one, then signs the current browser
 * out — so the seller ends up at a signed-out state rather than on a dashboard
 * that will fail on its next request.
 */
export async function signOutEverywhereAction(): Promise<void> {
  const user = await requireUserStrict();

  await revokeSessions(user.id, "auth.sign_out_everywhere");
  await signOut({ redirect: false });

  redirect("/login?signedOut=1");
}
