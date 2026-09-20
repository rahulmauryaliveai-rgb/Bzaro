import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { env } from "@/env";
import { otpProvider } from "@/lib/otp";
import type { OtpPurpose } from "@/generated/prisma/enums";

/**
 * OTP challenge lifecycle: issue → verify → consume.
 *
 * ── Only a keyed hash is stored ──────────────────────────────────────────────
 * tokens.ts stores a plain SHA-256 because its tokens are 256 bits of CSPRNG
 * output — there is nothing to brute-force. A six-digit OTP is the opposite:
 * a million candidates, so a plain hash in a database dump is the code. The
 * hash here is an HMAC keyed by OTP_PEPPER, which lives only in the server
 * environment; a dump without it verifies nothing.
 *
 * ── Three attempts, five minutes, single use ─────────────────────────────────
 * Online guessing is bounded three ways: the attempt counter on the row, the
 * `otpVerify` rate limit in front of the action, and the `otp` send limit per
 * phone. The counter is incremented with a guarded UPDATE (`attempts <
 * maxAttempts`) so two parallel guesses cannot both pass as the third; the
 * CHECK constraint in the migration is the backstop behind that.
 *
 * Issuing a new code deletes any open challenge for the same phone and
 * purpose — "resend" invalidates the previous code rather than leaving two
 * live ones.
 */

export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 3;

/**
 * In development the pepper may be unset; a fixed fallback keeps the flow
 * working. Production requires OTP_PEPPER at boot (src/env.ts), so the
 * fallback can never be reached there.
 */
const pepper = env.OTP_PEPPER || env.AUTH_SECRET || "dev-only-otp-pepper";

function hashCode(phone: string, purpose: OtpPurpose, code: string): string {
  return createHmac("sha256", pepper).update(`${phone}:${purpose}:${code}`).digest("hex");
}

/**
 * Test rigs may pin the code (see OTP_TEST_CODE in src/env.ts). A production
 * build honours it only alongside ALLOW_INSECURE_RATE_LIMIT, which is already
 * the documented "never on a real deployment" flag (D26).
 */
const pinnedCode =
  env.OTP_TEST_CODE && (env.NODE_ENV !== "production" || env.ALLOW_INSECURE_RATE_LIMIT)
    ? env.OTP_TEST_CODE
    : null;

if (pinnedCode) {
  console.warn("[otp] OTP_TEST_CODE is set: every OTP is the same fixed code. Test rigs only.");
}

function generateCode(): string {
  if (pinnedCode) return pinnedCode;
  // randomInt is uniform; padStart keeps leading zeros ("004213" is valid).
  return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0");
}

export type IssueOtpInput = {
  /** E.164, already normalised. */
  phone: string;
  purpose: OtpPurpose;
  ipHash?: string | null;
};

export type IssueOtpResult =
  { ok: true; challengeId: string; expiresAt: Date } | { ok: false; reason: "delivery_failed" };

/** Create a challenge and hand the code to the provider. */
export async function issueOtp(input: IssueOtpInput): Promise<IssueOtpResult> {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  const challenge = await db.$transaction(async (tx) => {
    await tx.otpChallenge.deleteMany({
      where: { phone: input.phone, purpose: input.purpose, consumedAt: null },
    });
    return tx.otpChallenge.create({
      data: {
        phone: input.phone,
        purpose: input.purpose,
        codeHash: hashCode(input.phone, input.purpose, code),
        maxAttempts: OTP_MAX_ATTEMPTS,
        expiresAt,
        ipHash: input.ipHash ?? null,
      },
      select: { id: true },
    });
  });

  const delivered = await otpProvider.send({
    phone: input.phone,
    code,
    purpose: input.purpose,
    ttlMinutes: OTP_TTL_MS / 60_000,
  });

  if (!delivered) {
    // Nothing reached the buyer, so nothing should be guessable.
    await db.otpChallenge.delete({ where: { id: challenge.id } }).catch(() => undefined);
    return { ok: false, reason: "delivery_failed" };
  }

  return { ok: true, challengeId: challenge.id, expiresAt };
}

export type VerifyOtpInput = {
  phone: string;
  purpose: OtpPurpose;
  code: string;
};

export type VerifyOtpResult =
  | { ok: true; challengeId: string }
  | {
      ok: false;
      /**
       * invalid  — no open challenge (never issued, already used, or superseded)
       * expired  — past the five-minute window
       * locked   — three wrong guesses; the buyer must request a new code
       * mismatch — wrong code, attempts remain
       */
      reason: "invalid" | "expired" | "locked" | "mismatch";
      attemptsRemaining?: number;
    };

/**
 * Check a code against the latest open challenge and consume it on success.
 *
 * Every rejection path except `mismatch` is terminal for that challenge — the
 * buyer's only way forward is a fresh code. `mismatch` reports how many
 * guesses remain so the UI can say so instead of silently locking.
 */
export async function verifyOtp(input: VerifyOtpInput): Promise<VerifyOtpResult> {
  if (!/^\d{6}$/.test(input.code)) return { ok: false, reason: "mismatch" };

  const challenge = await db.otpChallenge.findFirst({
    where: { phone: input.phone, purpose: input.purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, codeHash: true, attempts: true, maxAttempts: true, expiresAt: true },
  });

  if (!challenge) return { ok: false, reason: "invalid" };
  if (challenge.expiresAt < new Date()) return { ok: false, reason: "expired" };
  if (challenge.attempts >= challenge.maxAttempts) return { ok: false, reason: "locked" };

  const expected = Buffer.from(challenge.codeHash);
  const actual = Buffer.from(hashCode(input.phone, input.purpose, input.code));
  const matches = expected.length === actual.length && timingSafeEqual(expected, actual);

  if (!matches) {
    // Guarded increment: a concurrent guess that already spent the last
    // attempt makes this a no-op rather than a fourth try.
    const bumped = await db.otpChallenge.updateMany({
      where: { id: challenge.id, attempts: { lt: challenge.maxAttempts } },
      data: { attempts: { increment: 1 } },
    });
    const attemptsUsed = bumped.count === 1 ? challenge.attempts + 1 : challenge.maxAttempts;
    const remaining = Math.max(0, challenge.maxAttempts - attemptsUsed);
    return remaining === 0
      ? { ok: false, reason: "locked", attemptsRemaining: 0 }
      : { ok: false, reason: "mismatch", attemptsRemaining: remaining };
  }

  // Single use: only the first correct submission wins a race.
  const consumed = await db.otpChallenge.updateMany({
    where: { id: challenge.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (consumed.count !== 1) return { ok: false, reason: "invalid" };

  return { ok: true, challengeId: challenge.id };
}

/** Housekeeping for the nightly cron. */
export async function pruneExpiredOtpChallenges(): Promise<number> {
  const result = await db.otpChallenge.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  });
  return result.count;
}
