import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Buyer identity token — the value inside the buyer cookie.
 *
 * Format: `<buyerId>.<expiresAtSeconds>.<base64url HMAC-SHA256>`.
 *
 * Deliberately NOT a JWT: there is one claim, one issuer and one verifier, so a
 * dependency and an algorithm-negotiation surface would buy nothing. The
 * signature covers both the id and the expiry, so neither can be edited.
 *
 * Pure — node:crypto only — so it is unit-testable and shared by the request
 * path and any future worker that needs to mint links for buyers.
 */

export const BUYER_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createBuyerToken(
  secret: string,
  buyerId: string,
  nowMs: number = Date.now(),
  ttlSeconds: number = BUYER_TOKEN_TTL_SECONDS,
): string {
  if (!buyerId || buyerId.includes(".")) throw new Error("invalid buyerId");
  const expiresAt = Math.floor(nowMs / 1000) + ttlSeconds;
  const payload = `${buyerId}.${expiresAt}`;
  return `${payload}.${sign(secret, payload)}`;
}

export type BuyerTokenResult =
  | { ok: true; buyerId: string; expiresAt: number }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

export function verifyBuyerToken(
  secret: string,
  token: string | null | undefined,
  nowMs: number = Date.now(),
): BuyerTokenResult {
  if (!token || token.length > 256) return { ok: false, reason: "malformed" };

  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };

  const [buyerId, expiresRaw, signature] = parts as [string, string, string];
  const expiresAt = Number(expiresRaw);
  if (!buyerId || !Number.isInteger(expiresAt) || !signature) {
    return { ok: false, reason: "malformed" };
  }

  const expected = Buffer.from(sign(secret, `${buyerId}.${expiresAt}`));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, reason: "bad_signature" };
  }

  if (expiresAt * 1000 <= nowMs) return { ok: false, reason: "expired" };

  return { ok: true, buyerId, expiresAt };
}
