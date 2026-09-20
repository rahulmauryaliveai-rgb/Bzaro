import "server-only";
import { db } from "@/lib/db";

/**
 * Buyer identity (decision D28).
 *
 * A Buyer is a verified phone number. It is created the first time an OTP for
 * BUYER_CONTACT is confirmed and updated on every subsequent verification, so
 * `phoneVerifiedAt` always reflects the most recent proof of possession.
 */

export type BuyerSession = {
  id: string;
  phone: string;
  name: string | null;
  locationId: string | null;
  isBlocked: boolean;
};

const sessionSelect = {
  id: true,
  phone: true,
  name: true,
  locationId: true,
  isBlocked: true,
} as const;

/** Called once an OTP has been verified for `phone`. */
export async function upsertBuyerFromOtp(phone: string): Promise<BuyerSession> {
  const now = new Date();
  return db.buyer.upsert({
    where: { phone },
    create: { phone, phoneVerifiedAt: now, lastSeenAt: now },
    update: { phoneVerifiedAt: now, lastSeenAt: now },
    select: sessionSelect,
  });
}

/**
 * Resolve a buyer from a cookie-supplied id. Returns null for an unknown id —
 * a stale cookie after a data reset must fall back to the OTP step, not 500.
 */
export async function getBuyerSession(buyerId: string): Promise<BuyerSession | null> {
  return db.buyer.findUnique({ where: { id: buyerId }, select: sessionSelect });
}

/** Remember what the buyer told us on the requirement form. */
export async function rememberBuyerDetails(
  buyerId: string,
  details: { name?: string; locationId?: string },
): Promise<void> {
  await db.buyer.update({
    where: { id: buyerId },
    data: {
      ...(details.name ? { name: details.name } : {}),
      ...(details.locationId ? { locationId: details.locationId } : {}),
      lastSeenAt: new Date(),
    },
  });
}
