import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { env } from "@/env";
import { mailer } from "@/lib/mail";
import { emailOtpEmail } from "@/lib/mail/templates";
import type { EmailOtpPurpose } from "@/generated/prisma/enums";

/**
 * Email OTP lifecycle: issue → verify → consume. The buyer's verification
 * channel (D35); `challenge.ts` is the same shape for the seller's phone.
 *
 * The storage rule is identical and for the same reason: a six-digit code is a
 * million candidates, so only an HMAC keyed by OTP_PEPPER is written. A
 * database dump without the pepper verifies nothing.
 *
 * Wider than the phone challenge on purpose — five attempts over ten minutes
 * rather than three over five. Email arrives more slowly and less reliably than
 * SMS, and a buyer re-reading a code out of a spam folder should not be locked
 * out for it. Online guessing is still bounded by the attempt counter, the
 * per-email send limit and the per-IP send limit.
 */

export const EMAIL_OTP_LENGTH = 6;
export const EMAIL_OTP_TTL_MS = 10 * 60 * 1000;
export const EMAIL_OTP_MAX_ATTEMPTS = 5;
/** A resend before this is refused, so "resend" cannot be used to spam a mailbox. */
export const EMAIL_OTP_RESEND_COOLDOWN_MS = 60 * 1000;

const pepper = env.OTP_PEPPER || env.AUTH_SECRET || "dev-only-otp-pepper";

function hashCode(email: string, purpose: EmailOtpPurpose, code: string): string {
  return createHmac("sha256", pepper).update(`${email}:${purpose}:${code}`).digest("hex");
}

/** Same test-rig escape hatch as the phone challenge (D26). */
const pinnedCode =
  env.OTP_TEST_CODE && (env.NODE_ENV !== "production" || env.ALLOW_INSECURE_RATE_LIMIT)
    ? env.OTP_TEST_CODE
    : null;

function generateCode(): string {
  if (pinnedCode) return pinnedCode;
  return String(randomInt(0, 10 ** EMAIL_OTP_LENGTH)).padStart(EMAIL_OTP_LENGTH, "0");
}

export type IssueEmailOtpResult =
  | { ok: true; expiresAt: Date }
  | { ok: false; reason: "delivery_failed" | "cooldown"; retryAfterMs?: number };

export async function issueEmailOtp(input: {
  /** Lower-cased by the caller's schema. */
  email: string;
  purpose: EmailOtpPurpose;
  ipHash?: string | null;
}): Promise<IssueEmailOtpResult> {
  const now = Date.now();

  const open = await db.emailOtp.findFirst({
    where: { email: input.email, purpose: input.purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  if (open) {
    const elapsed = now - open.createdAt.getTime();
    if (elapsed < EMAIL_OTP_RESEND_COOLDOWN_MS) {
      return {
        ok: false,
        reason: "cooldown",
        retryAfterMs: EMAIL_OTP_RESEND_COOLDOWN_MS - elapsed,
      };
    }
  }

  const code = generateCode();
  const expiresAt = new Date(now + EMAIL_OTP_TTL_MS);

  const challenge = await db.$transaction(async (tx) => {
    // Resending invalidates the previous code rather than leaving two live.
    await tx.emailOtp.deleteMany({
      where: { email: input.email, purpose: input.purpose, consumedAt: null },
    });
    return tx.emailOtp.create({
      data: {
        email: input.email,
        purpose: input.purpose,
        codeHash: hashCode(input.email, input.purpose, code),
        maxAttempts: EMAIL_OTP_MAX_ATTEMPTS,
        expiresAt,
        ipHash: input.ipHash ?? null,
      },
      select: { id: true },
    });
  });

  const delivered = await mailer.send(
    emailOtpEmail({
      to: input.email,
      code,
      purpose: input.purpose,
      ttlMinutes: EMAIL_OTP_TTL_MS / 60_000,
    }),
  );

  if (!delivered) {
    // Nothing reached the buyer, so nothing should be guessable.
    await db.emailOtp.delete({ where: { id: challenge.id } }).catch(() => undefined);
    return { ok: false, reason: "delivery_failed" };
  }

  return { ok: true, expiresAt };
}

export type VerifyEmailOtpResult =
  | { ok: true }
  | {
      ok: false;
      reason: "invalid" | "expired" | "locked" | "mismatch";
      attemptsRemaining?: number;
    };

export async function verifyEmailOtp(input: {
  email: string;
  purpose: EmailOtpPurpose;
  code: string;
}): Promise<VerifyEmailOtpResult> {
  if (!/^\d{6}$/.test(input.code)) return { ok: false, reason: "mismatch" };

  const challenge = await db.emailOtp.findFirst({
    where: { email: input.email, purpose: input.purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, codeHash: true, attempts: true, maxAttempts: true, expiresAt: true },
  });

  if (!challenge) return { ok: false, reason: "invalid" };
  if (challenge.expiresAt < new Date()) return { ok: false, reason: "expired" };
  if (challenge.attempts >= challenge.maxAttempts) return { ok: false, reason: "locked" };

  const expected = Buffer.from(challenge.codeHash);
  const actual = Buffer.from(hashCode(input.email, input.purpose, input.code));
  const matches = expected.length === actual.length && timingSafeEqual(expected, actual);

  if (!matches) {
    // Guarded increment, so two parallel guesses cannot both spend the last try.
    const bumped = await db.emailOtp.updateMany({
      where: { id: challenge.id, attempts: { lt: challenge.maxAttempts } },
      data: { attempts: { increment: 1 } },
    });
    const attemptsUsed = bumped.count === 1 ? challenge.attempts + 1 : challenge.maxAttempts;
    const remaining = Math.max(0, challenge.maxAttempts - attemptsUsed);
    return remaining === 0
      ? { ok: false, reason: "locked", attemptsRemaining: 0 }
      : { ok: false, reason: "mismatch", attemptsRemaining: remaining };
  }

  const consumed = await db.emailOtp.updateMany({
    where: { id: challenge.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (consumed.count !== 1) return { ok: false, reason: "invalid" };

  return { ok: true };
}

/** Housekeeping for the nightly cron, mirroring the phone challenge's prune. */
export async function pruneExpiredEmailOtps(): Promise<number> {
  const result = await db.emailOtp.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  });
  return result.count;
}
