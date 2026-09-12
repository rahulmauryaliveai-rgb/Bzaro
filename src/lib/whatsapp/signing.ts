import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/env";

/**
 * HMAC signing for the WhatsApp click tracker (threat T6).
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * `/api/wa` logs a click and then redirects. Unsigned, `?to=<anything>` would
 * be an open redirect: an attacker could send victims to a phishing page
 * through a bzaro.in link, borrowing the platform's domain reputation —
 * and every link checker and email filter would wave it through.
 *
 * Two defences, both required:
 *   1. The destination is NEVER taken from the request. The handler looks the
 *      seller's number up in the database and only ever forwards to wa.me.
 *   2. The parameters are signed, so the endpoint cannot be used as a generic
 *      click-logging or enumeration tool against arbitrary seller ids.
 *
 * The signature is truncated to 128 bits: ample against forgery, and short
 * enough to keep these URLs readable in a page's HTML.
 */

export type WhatsAppClickParams = {
  sellerId: string;
  entityType?: string;
  entityId?: string;
};

function canonicalString(params: WhatsAppClickParams): string {
  // Fixed field order. Signing a map in iteration order would let a caller
  // reorder parameters to produce a different string with the same meaning.
  return [params.sellerId, params.entityType ?? "", params.entityId ?? ""].join("|");
}

export function signWhatsAppClick(params: WhatsAppClickParams): string {
  return createHmac("sha256", env.REVALIDATE_SECRET || "dev-secret")
    .update(canonicalString(params))
    .digest("base64url")
    .slice(0, 22);
}

export function verifyWhatsAppClick(params: WhatsAppClickParams, signature: string): boolean {
  if (!signature || signature.length > 64) return false;

  const expected = signWhatsAppClick(params);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);

  // Length check first: timingSafeEqual throws on a length mismatch, and the
  // length itself is not a secret.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
