import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";

/**
 * Single-use tokens for email verification and password reset.
 *
 * ── Only the hash is stored ──────────────────────────────────────────────────
 * The token that goes in the email is never written to the database; its
 * SHA-256 digest is. Anyone who obtains a database dump therefore cannot mint a
 * working reset link — which matters, because a password-reset token is a
 * password.
 *
 * SHA-256 without a salt is correct here, unlike for passwords: these tokens
 * are 256 bits of CSPRNG output, so there is no dictionary to attack and no
 * work factor worth paying.
 *
 * ── Reusing Auth.js's VerificationToken table ────────────────────────────────
 * The identifier is namespaced by purpose (`verify:you@example.com`) so one
 * table serves both flows without a reset token ever being accepted as an
 * email verification.
 */

export const TOKEN_PURPOSES = {
  emailVerification: "verify",
  passwordReset: "reset",
  /** Store sign-in hand-off (src/server/services/handoff.service.ts). */
  storeHandoff: "handoff",
} as const;

export type TokenPurpose = (typeof TOKEN_PURPOSES)[keyof typeof TOKEN_PURPOSES];

export const TOKEN_TTL_MS = {
  verify: 24 * 60 * 60 * 1000,
  reset: 60 * 60 * 1000,
  // Redeemed by an immediate redirect; anything slower is not a browser.
  handoff: 2 * 60 * 1000,
} as const;

function identifierFor(purpose: TokenPurpose, email: string): string {
  return `${purpose}:${email.toLowerCase()}`;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Issue a token, returning the plaintext for the email.
 *
 * Any outstanding token for the same purpose and address is deleted first, so
 * requesting a second reset link immediately invalidates the first. Otherwise a
 * link sent to a compromised inbox stays live for its full window even after
 * the user re-requests.
 */
export async function issueToken(purpose: TokenPurpose, email: string): Promise<string> {
  const identifier = identifierFor(purpose, email);

  await db.verificationToken.deleteMany({ where: { identifier } });

  const token = randomBytes(32).toString("base64url");

  await db.verificationToken.create({
    data: {
      identifier,
      token: hashToken(token),
      expires: new Date(Date.now() + TOKEN_TTL_MS[purpose]),
    },
  });

  return token;
}

export type TokenResult =
  { ok: true; email: string } | { ok: false; reason: "invalid" | "expired" };

/**
 * Consume a token: verify, then delete.
 *
 * Deletion happens whether or not the token had expired, so a leaked expired
 * token cannot linger. The lookup is by hash, so an attacker who can enumerate
 * rows still cannot derive a usable token.
 */
export async function consumeToken(purpose: TokenPurpose, token: string): Promise<TokenResult> {
  if (!token || token.length > 200) return { ok: false, reason: "invalid" };

  const hashed = hashToken(token);

  const record = await db.verificationToken.findUnique({
    where: { token: hashed },
    select: { identifier: true, token: true, expires: true },
  });

  if (!record) return { ok: false, reason: "invalid" };

  const prefix = `${purpose}:`;
  if (!record.identifier.startsWith(prefix)) {
    // A reset token presented as an email verification, or vice versa.
    return { ok: false, reason: "invalid" };
  }

  // Constant-time comparison. The lookup already matched, so this guards only
  // against exotic timing oracles — but it costs nothing.
  const a = Buffer.from(record.token);
  const b = Buffer.from(hashed);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "invalid" };
  }

  await db.verificationToken.delete({ where: { token: hashed } });

  if (record.expires < new Date()) return { ok: false, reason: "expired" };

  return { ok: true, email: record.identifier.slice(prefix.length) };
}

/** Housekeeping for the nightly cron: drop tokens nobody will ever use. */
export async function pruneExpiredTokens(): Promise<number> {
  const result = await db.verificationToken.deleteMany({
    where: { expires: { lt: new Date() } },
  });
  return result.count;
}
