import "server-only";
import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";

/**
 * The visitor's city (Phase 3).
 *
 * Resolution order, cheapest first:
 *   1. `bz_loc` cookie — an explicit choice, so it always wins.
 *   2. Cloudflare's `cf-ipcity` / `cf-region` headers, matched against the
 *      Location tree. Approximate, and only ever a default.
 *   3. Nothing. Search and category pages stay open and crawlable without a
 *      city; this is a filter, never a gate.
 *
 * ── Why this cookie is not signed ────────────────────────────────────────────
 * It holds a city id the visitor picked from a list we rendered. Forging it
 * changes which sellers you see — which is exactly what the picker does anyway.
 * There is nothing to protect, so it stays readable and cheap. The buyer's
 * authoritative city lives on `BuyerProfile` once they sign in.
 *
 * Deliberately NOT host-only: a buyer who chose Mumbai on the marketplace
 * should still see Mumbai on a seller's storefront. It carries no identity, so
 * the XSS reasoning that keeps the session cookie host-only does not apply.
 */

export const LOCATION_COOKIE_NAME = "bz_loc";
const LOCATION_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

export type ResolvedLocation = {
  id: string;
  name: string;
  slug: string;
  /** How we arrived at it — the bar says "Showing sellers near X" either way. */
  source: "cookie" | "ip" | "profile";
};

/** Read the explicit choice, if there is one. Does not hit the database. */
export async function readLocationCookie(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(LOCATION_COOKIE_NAME)?.value;
  return value && value.length <= 64 ? value : null;
}

/** Can only be called from a Server Action or Route Handler (Next.js rule). */
export async function setLocationCookie(locationId: string): Promise<void> {
  const store = await cookies();
  store.set(LOCATION_COOKIE_NAME, locationId, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: LOCATION_COOKIE_MAX_AGE,
  });
}

/**
 * Cloudflare's guess at the visitor's city, as a Location row.
 *
 * Requires the "Add visitor location headers" managed transform to be enabled;
 * without it the headers are simply absent and this returns null, which is a
 * supported state rather than an error.
 */
async function cityFromRequestHeaders(): Promise<{
  id: string;
  name: string;
  slug: string;
} | null> {
  const requestHeaders = await headers();
  const city = requestHeaders.get("cf-ipcity");
  if (!city) return null;

  // Match on name rather than slug: Cloudflare sends display names ("New
  // Delhi"), not our slugs. Citext-insensitive comparison via `mode`.
  return db.location.findFirst({
    where: { type: "CITY", isActive: true, name: { equals: city, mode: "insensitive" } },
    select: { id: true, name: true, slug: true },
  });
}

/**
 * The city to show this visitor, or null.
 *
 * `profileLocationId` is the signed-in buyer's saved city and outranks the IP
 * guess but not an explicit cookie — someone who just picked a city in the
 * header means it for this session.
 */
export async function resolveLocation(
  profileLocationId?: string | null,
): Promise<ResolvedLocation | null> {
  const cookieId = await readLocationCookie();

  const explicitId = cookieId ?? profileLocationId ?? null;
  if (explicitId) {
    const row = await db.location.findFirst({
      where: { id: explicitId, type: "CITY", isActive: true },
      select: { id: true, name: true, slug: true },
    });
    // A stale id (renamed or deactivated city) falls through to the IP guess
    // rather than leaving the visitor with a broken filter.
    if (row) return { ...row, source: cookieId ? "cookie" : "profile" };
  }

  const guess = await cityFromRequestHeaders();
  return guess ? { ...guess, source: "ip" } : null;
}
