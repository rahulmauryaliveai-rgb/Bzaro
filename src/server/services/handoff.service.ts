import "server-only";
import { encode } from "next-auth/jwt";
import { db } from "@/lib/db";
import { env } from "@/env";
import { consumeToken, issueToken, TOKEN_PURPOSES } from "@/lib/tokens";
import { SESSION_MAX_AGE_SECONDS, sessionCookieName } from "@/lib/auth/config";
import { getSubdomain, normalizeHost, PROTOCOL } from "@/lib/utils/url";

/**
 * Store sign-in hand-off (DECISIONS D36).
 *
 * The platform session cookie is host-only on bzaro.in (a seller's stored XSS
 * on their own storefront must never be able to ride it). A buyer who wants to
 * be signed in on ONE store — to use its cart, or because they chose Google,
 * whose only redirect URI is on the apex — is handed across explicitly:
 *
 *   store  → bzaro.in/account/handoff?to=<store url>   (sign in there if needed)
 *   apex   → one-time 256-bit token bound to (user, store host), 2-minute TTL
 *   store  → /api/account/handoff?token=…  mints a host-only session for THAT
 *            store and redirects back to where the buyer was.
 *
 * Blast radius stays one store and one buyer. Seller and staff accounts are
 * never handed off: their sessions stay on bzaro.in only.
 */

/** A tenant subdomain URL we are willing to hand a session to, or null. */
export function parseStoreTarget(raw: string | null | undefined): URL | null {
  if (!raw || raw.length > 2000) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== `${PROTOCOL}:`) return null;
  if (url.username || url.password) return null;
  const host = normalizeHost(url.host);
  if (!host) return null;
  const label = getSubdomain(host);
  if (!label || label === "www") return null;
  return url;
}

function identifierFor(userId: string, host: string): string {
  return `${userId}|${host.toLowerCase()}`;
}

/** The store URL that completes the hand-off (contains a one-time token). */
export async function createStoreHandoff(userId: string, target: URL): Promise<string> {
  const token = await issueToken(TOKEN_PURPOSES.storeHandoff, identifierFor(userId, target.host));
  const back = `${target.pathname}${target.search}` || "/";
  const url = new URL("/api/account/handoff", `${target.protocol}//${target.host}`);
  url.searchParams.set("token", token);
  url.searchParams.set("to", back);
  return url.toString();
}

export type RedeemResult =
  | { ok: true; cookie: { name: string; value: string; maxAge: number } }
  | { ok: false; reason: "invalid" | "expired" | "wrong_host" | "not_buyer" };

/** Redeem on the store host: verify the token, mint that host's session cookie. */
export async function redeemStoreHandoff(
  token: string,
  requestHost: string,
): Promise<RedeemResult> {
  const result = await consumeToken(TOKEN_PURPOSES.storeHandoff, token);
  if (!result.ok) return { ok: false, reason: result.reason };

  const separator = result.email.lastIndexOf("|");
  const userId = result.email.slice(0, separator);
  const boundHost = result.email.slice(separator + 1);
  if (separator < 1 || boundHost !== requestHost.toLowerCase()) {
    return { ok: false, reason: "wrong_host" };
  }

  const user = await db.user.findFirst({
    where: { id: userId, isActive: true, deletedAt: null },
    select: { id: true, name: true, email: true, image: true, role: true },
  });
  if (!user || user.role !== "BUYER") return { ok: false, reason: "not_buyer" };

  // Same claims the Auth.js jwt callback writes at sign-in (src/lib/auth/config.ts),
  // so the store session revalidates, expires and is revoked exactly like one
  // created by a normal login.
  const value = await encode({
    token: {
      sub: user.id,
      name: user.name,
      email: user.email,
      picture: user.image,
      uid: user.id,
      role: user.role,
      checkedAt: Math.floor(Date.now() / 1000),
    },
    secret: env.AUTH_SECRET ?? "",
    salt: sessionCookieName,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return { ok: true, cookie: { name: sessionCookieName, value, maxAge: SESSION_MAX_AGE_SECONDS } };
}
