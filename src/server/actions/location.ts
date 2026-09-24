"use server";

import { resolveLocation, setLocationCookie } from "@/lib/location/cookie";
import { lookupPincode, nearestPincode } from "@/server/services/pincode.service";
import { getBuyerSession, rememberBuyerDetails } from "@/server/services/buyer.service";
import { db } from "@/lib/db";

/**
 * Choosing a city (Phase 3).
 *
 * Every path ends the same way: write the `bz_loc` cookie, and mirror it onto
 * `BuyerProfile` when someone is signed in, so the choice follows them to
 * another device.
 */

export type LocationState = {
  ok?: boolean;
  error?: string;
  city?: { id: string; name: string };
};

export type LocationBarState = {
  current: { id: string; name: string } | null;
  cities: Array<{ id: string; name: string }>;
};

/**
 * What the location bar should show.
 *
 * Called from the client after mount rather than during render: reading cookies
 * or `cf-ipcity` in the layout would make every marketplace page dynamic, and
 * these pages must stay static and crawlable (the city is a filter, not a gate).
 */
export async function resolveLocationBarAction(): Promise<LocationBarState> {
  const buyer = await getBuyerSession();
  const [current, cities] = await Promise.all([
    resolveLocation(buyer?.locationId),
    db.location.findMany({
      where: { type: "CITY", isActive: true },
      select: { id: true, name: true },
      orderBy: [{ sellerCount: "desc" }, { name: "asc" }],
      take: 40,
    }),
  ]);

  return { current: current ? { id: current.id, name: current.name } : null, cities };
}

async function persist(locationId: string, pincode?: string): Promise<void> {
  await setLocationCookie(locationId);

  const buyer = await getBuyerSession();
  if (buyer) {
    await rememberBuyerDetails(buyer.id, { locationId, ...(pincode ? { pincode } : {}) });
  }
}

/** The buyer picked a city from the list. */
export async function chooseCityAction(locationId: string): Promise<LocationState> {
  const city = await db.location.findFirst({
    where: { id: locationId, type: "CITY", isActive: true },
    select: { id: true, name: true },
  });
  if (!city) return { error: "We don't cover that city yet." };

  await persist(city.id);
  return { ok: true, city };
}

/** The buyer typed a pincode. */
export async function choosePincodeAction(pincode: string): Promise<LocationState> {
  const match = await lookupPincode(pincode.trim());
  if (!match) return { error: "We don't recognise that PIN code." };
  if (!match.locationId) {
    return { error: `We know ${match.city}, but have no sellers there yet.` };
  }

  await persist(match.locationId, match.pincode);
  return { ok: true, city: { id: match.locationId, name: match.locationName ?? match.city } };
}

/** The buyer granted browser geolocation. */
export async function chooseCoordinatesAction(
  latitude: number,
  longitude: number,
): Promise<LocationState> {
  const match = await nearestPincode(latitude, longitude);
  if (!match?.locationId) {
    return { error: "We couldn't find a city near you. Try a PIN code instead." };
  }

  await persist(match.locationId, match.pincode);
  return { ok: true, city: { id: match.locationId, name: match.locationName ?? match.city } };
}
