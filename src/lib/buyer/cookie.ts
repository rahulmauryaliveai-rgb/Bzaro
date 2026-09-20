import "server-only";
import { cookies } from "next/headers";
import { env } from "@/env";
import { BUYER_TOKEN_TTL_SECONDS, createBuyerToken, verifyBuyerToken } from "@/lib/buyer/token";

/**
 * The buyer cookie.
 *
 * Minted once an OTP is verified so a returning buyer can contact a second
 * supplier without a second code. It carries only a signed buyer id — the
 * phone, name and city are read from the Buyer row, where `isBlocked` is
 * also checked on every use.
 *
 * ── Scoped exactly like the session cookie ───────────────────────────────────
 * HOST-ONLY (no `Domain`), `__Host-` prefixed when served over https. The
 * reasoning in src/lib/auth/config.ts applies unchanged: a cookie scoped to
 * `.bzaro.in` would be sent to every tenant subdomain, where any seller's
 * stored XSS could read it. Consequence: a buyer who verified on the
 * marketplace is NOT automatically recognised on a microsite, and vice versa.
 * That is an accepted cost; the OTP is a 30-second detour.
 *
 * Can only be SET from a Server Action or Route Handler (Next.js rule), which
 * is where OTP verification happens anyway.
 */

const isSecureOrigin = env.AUTH_URL
  ? env.AUTH_URL.startsWith("https://")
  : env.NODE_ENV === "production";

export const BUYER_COOKIE_NAME = isSecureOrigin ? "__Host-bz_buyer" : "bz_buyer";

/** Development fallback mirrors the OTP pepper's. Production requires it. */
const secret = env.BUYER_COOKIE_SECRET || env.AUTH_SECRET || "dev-only-buyer-cookie-secret";

export async function setBuyerCookie(buyerId: string): Promise<void> {
  const store = await cookies();
  store.set(BUYER_COOKIE_NAME, createBuyerToken(secret, buyerId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: isSecureOrigin,
    maxAge: BUYER_TOKEN_TTL_SECONDS,
    // Deliberately no `domain`. See above.
  });
}

export async function clearBuyerCookie(): Promise<void> {
  const store = await cookies();
  store.delete(BUYER_COOKIE_NAME);
}

/** The signed buyer id from the cookie, or null. Does NOT hit the database. */
export async function readBuyerIdFromCookie(): Promise<string | null> {
  const store = await cookies();
  const result = verifyBuyerToken(secret, store.get(BUYER_COOKIE_NAME)?.value);
  return result.ok ? result.buyerId : null;
}
