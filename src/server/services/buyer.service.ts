import "server-only";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth/config";

/**
 * Buyer identity.
 *
 * A buyer is a full `User` account — email and password verified by an email
 * OTP, or Google — so identity comes from the Auth.js session and never from a
 * separate cookie. `BuyerProfile` holds only what is specific to buying: the
 * last location they chose, which pre-fills the requirement form.
 */

export type BuyerSession = {
  id: string;
  name: string | null;
  /** Nullable: `User.phone` is optional, and sellers/admins share this table. */
  phone: string | null;
  locationId: string | null;
  isBlocked: boolean;
};

/**
 * The signed-in buyer, or null when nobody is signed in. Returns a session for
 * any authenticated user: a seller browsing the marketplace is also a buyer.
 */
export async function getBuyerSession(): Promise<BuyerSession | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const user = await db.user.findFirst({
    where: { id: userId, isActive: true, deletedAt: null },
    select: {
      id: true,
      name: true,
      phone: true,
      buyerProfile: { select: { locationId: true, isBlocked: true } },
    },
  });
  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    locationId: user.buyerProfile?.locationId ?? null,
    isBlocked: user.buyerProfile?.isBlocked ?? false,
  };
}

/** Remember what the buyer told us on the requirement form. */
export async function rememberBuyerDetails(
  userId: string,
  details: { name?: string; locationId?: string; pincode?: string },
): Promise<void> {
  if (details.name) {
    await db.user.update({ where: { id: userId }, data: { name: details.name } });
  }

  const profile = {
    ...(details.locationId ? { locationId: details.locationId } : {}),
    ...(details.pincode ? { pincode: details.pincode } : {}),
  };
  if (Object.keys(profile).length === 0) return;

  await db.buyerProfile.upsert({
    where: { userId },
    create: { userId, ...profile },
    update: profile,
  });
}
