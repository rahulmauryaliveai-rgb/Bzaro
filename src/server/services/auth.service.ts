import "server-only";
import { hash, verify } from "@node-rs/argon2";
import { db } from "@/lib/db";
import { mailer } from "@/lib/mail";
import { passwordChangedEmail, passwordResetEmail, verificationEmail } from "@/lib/mail/templates";
import { consumeToken, issueToken, TOKEN_PURPOSES } from "@/lib/tokens";
import { marketplaceUrl } from "@/lib/utils/url";

/**
 * Account lifecycle: registration, verification, password reset and change.
 *
 * ── The rule this file exists to enforce ─────────────────────────────────────
 * Every privilege-reducing operation sets `User.sessionsInvalidAfter`.
 *
 * Sessions are JWT-backed (decision D19), so a token already in the wild stays
 * valid until it expires unless something explicitly invalidates it. That
 * column is the mechanism. `docs/SECURITY.md` §3 lists every operation that
 * must set it; this service owns three of them.
 *
 * Forgetting it is the one sharp edge of D19, which is why the writes here go
 * through `revokeSessions()` rather than being hand-rolled at each call site.
 */

/**
 * Argon2id parameters.
 *
 * OWASP's 2024 baseline is 19 MiB memory, 2 iterations, 1 degree of
 * parallelism. Memory cost is what defeats GPU cracking; iteration count alone
 * does not.
 */
const ARGON2_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export type RegisterResult =
  | { ok: true; userId: string; emailSent: boolean }
  | { ok: false; reason: "email_taken" | "phone_taken" };

/**
 * Register a user.
 *
 * Note what this does NOT do: create a seller. Registration produces a person;
 * claiming a business is a separate, deliberate step (`createSeller`). Keeping
 * them apart means a buyer can hold an account without a phantom empty tenant
 * being provisioned, and one person can later own more than one business.
 */
export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
  /** E.164. Seller onboarding step 1; buyers registering later may omit it. */
  phone?: string;
  /** E.164. Defaults to the phone. */
  whatsapp?: string;
  /** True when an OTP for the phone was verified in the same submission. */
  phoneVerified?: boolean;
}): Promise<RegisterResult> {
  const email = input.email.toLowerCase();

  const existing = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existing) return { ok: false, reason: "email_taken" };

  if (input.phone) {
    const phoneOwner = await db.user.findUnique({
      where: { phone: input.phone },
      select: { id: true },
    });
    if (phoneOwner) return { ok: false, reason: "phone_taken" };
  }

  const passwordHash = await hash(input.password, ARGON2_OPTIONS);

  const user = await db.user.create({
    data: {
      email,
      name: input.name.trim(),
      passwordHash,
      role: "BUYER",
      phone: input.phone ?? null,
      whatsapp: input.whatsapp ?? input.phone ?? null,
      phoneVerified: input.phone && input.phoneVerified ? new Date() : null,
    },
    select: { id: true, email: true },
  });

  await db.auditLog.create({
    data: { actorId: user.id, action: "auth.register" },
  });

  const emailSent = await sendVerificationEmail(user.email);

  return { ok: true, userId: user.id, emailSent };
}

/** Issue a fresh verification link and email it. */
export async function sendVerificationEmail(email: string): Promise<boolean> {
  const token = await issueToken(TOKEN_PURPOSES.emailVerification, email);
  const url = marketplaceUrl(`/verify-email?token=${encodeURIComponent(token)}`);
  return mailer.send(verificationEmail({ to: email, url }));
}

export type VerifyResult =
  { ok: true; alreadyVerified: boolean } | { ok: false; reason: "invalid" | "expired" | "no_user" };

export async function verifyEmail(token: string): Promise<VerifyResult> {
  const result = await consumeToken(TOKEN_PURPOSES.emailVerification, token);
  if (!result.ok) return { ok: false, reason: result.reason };

  const user = await db.user.findUnique({
    where: { email: result.email },
    select: { id: true, emailVerified: true },
  });

  if (!user) return { ok: false, reason: "no_user" };
  if (user.emailVerified) return { ok: true, alreadyVerified: true };

  await db.user.update({
    where: { id: user.id },
    data: { emailVerified: new Date() },
  });

  await db.auditLog.create({
    data: { actorId: user.id, action: "auth.email_verified" },
  });

  return { ok: true, alreadyVerified: false };
}

/**
 * Begin a password reset.
 *
 * Returns void, always. Reporting whether the address exists turns this
 * endpoint into an account-enumeration oracle, and it is unauthenticated and
 * world-reachable. The UI says "if that address has an account, we've sent a
 * link" regardless of what happened here.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const normalized = email.toLowerCase();

  const user = await db.user.findUnique({
    where: { email: normalized },
    select: { id: true, isActive: true, deletedAt: true },
  });

  if (!user || !user.isActive || user.deletedAt) return;

  const token = await issueToken(TOKEN_PURPOSES.passwordReset, normalized);
  const url = marketplaceUrl(`/reset-password?token=${encodeURIComponent(token)}`);

  await mailer.send(passwordResetEmail({ to: normalized, url }));

  await db.auditLog.create({
    data: { actorId: user.id, action: "auth.password_reset_requested" },
  });
}

export type ResetResult = { ok: true } | { ok: false; reason: "invalid" | "expired" | "no_user" };

export async function resetPassword(token: string, password: string): Promise<ResetResult> {
  const result = await consumeToken(TOKEN_PURPOSES.passwordReset, token);
  if (!result.ok) return { ok: false, reason: result.reason };

  const user = await db.user.findUnique({
    where: { email: result.email },
    select: { id: true },
  });

  if (!user) return { ok: false, reason: "no_user" };

  const passwordHash = await hash(password, ARGON2_OPTIONS);

  await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      // Completing a reset proves control of the mailbox.
      emailVerified: new Date(),
      // Clear any lockout — the legitimate owner just proved themselves, and
      // leaving them locked out after a successful reset is a support ticket.
      failedLogins: 0,
      lockedUntil: null,
      // Whoever forced the reset may have had a live session. Kill all of them.
      sessionsInvalidAfter: new Date(),
    },
  });

  await db.auditLog.create({
    data: { actorId: user.id, action: "auth.password_reset_completed" },
  });

  await mailer.send(passwordChangedEmail({ to: result.email }));

  return { ok: true };
}

export type ChangePasswordResult =
  { ok: true } | { ok: false; reason: "wrong_password" | "no_password_set" };

/** Change password for a signed-in user. Requires the current password. */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<ChangePasswordResult> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, passwordHash: true },
  });

  if (!user?.passwordHash) return { ok: false, reason: "no_password_set" };

  const valid = await verify(user.passwordHash, currentPassword);
  if (!valid) return { ok: false, reason: "wrong_password" };

  const passwordHash = await hash(newPassword, ARGON2_OPTIONS);

  await db.user.update({
    where: { id: userId },
    data: { passwordHash, sessionsInvalidAfter: new Date() },
  });

  await db.auditLog.create({
    data: { actorId: userId, action: "auth.password_changed" },
  });

  await mailer.send(passwordChangedEmail({ to: user.email }));

  return { ok: true };
}

/**
 * Invalidate every session for a user.
 *
 * The single choke point for D19's revocation mechanism. Suspension, banning,
 * role changes, member removal and "sign out everywhere" all route through
 * here, so the behaviour is defined once rather than remembered N times.
 */
export async function revokeSessions(userId: string, action: string): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: { sessionsInvalidAfter: new Date() },
  });

  await db.auditLog.create({
    data: { actorId: userId, action },
  });
}

/** Revoke sessions for every member of a seller — used on suspend and ban. */
export async function revokeSellerSessions(sellerId: string, action: string): Promise<void> {
  const members = await db.sellerMember.findMany({
    where: { sellerId },
    select: { userId: true },
  });

  const now = new Date();

  await db.$transaction([
    db.user.updateMany({
      where: { id: { in: members.map((m) => m.userId) } },
      data: { sessionsInvalidAfter: now },
    }),
    db.auditLog.create({ data: { sellerId, action } }),
  ]);
}

export { ARGON2_OPTIONS };
