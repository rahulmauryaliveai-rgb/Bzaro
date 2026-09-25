import "server-only";
import { db } from "@/lib/db";

/**
 * PIN code lookup (Phase 3).
 *
 * Two jobs, both deliberately served from our own table rather than a paid
 * geocoding API: turn a pincode the buyer typed into a city, and turn browser
 * lat/lng into the nearest pincode we know about.
 */

export type PincodeMatch = {
  pincode: string;
  city: string;
  state: string;
  locationId: string | null;
  locationName: string | null;
};

export async function lookupPincode(pincode: string): Promise<PincodeMatch | null> {
  if (!/^[1-9][0-9]{5}$/.test(pincode)) return null;

  const row = await db.pincode.findUnique({
    where: { pincode },
    select: {
      pincode: true,
      city: true,
      state: true,
      locationId: true,
      location: { select: { name: true } },
    },
  });
  if (!row) return null;

  return {
    pincode: row.pincode,
    city: row.city,
    state: row.state,
    locationId: row.locationId,
    locationName: row.location?.name ?? null,
  };
}

/**
 * Nearest known pincode to a coordinate.
 *
 * Equirectangular approximation rather than haversine: over the tens of
 * kilometres this is ever asked about, the error is far smaller than the
 * accuracy of a browser geolocation fix, and it is a plain arithmetic
 * expression Postgres can evaluate without PostGIS.
 *
 * The bounding box is what makes it cheap — it discards almost every row
 * before the distance is computed at all. One degree of latitude is ~111 km;
 * a 1.5° box is a generous "same metro and then some".
 */
export async function nearestPincode(
  latitude: number,
  longitude: number,
  options: { mappedOnly?: boolean } = {},
): Promise<PincodeMatch | null> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;

  const DELTA = 1.5;
  const rows = await db.$queryRaw<
    Array<{ pincode: string; city: string; state: string; locationId: string | null }>
  >`
    SELECT "pincode", "city", "state", "locationId"
    FROM "Pincode"
    WHERE "latitude" IS NOT NULL
      AND "longitude" IS NOT NULL
      AND (${!options.mappedOnly}::boolean OR "locationId" IS NOT NULL)
      AND "latitude"  BETWEEN ${latitude - DELTA}  AND ${latitude + DELTA}
      AND "longitude" BETWEEN ${longitude - DELTA} AND ${longitude + DELTA}
    ORDER BY
      POWER("latitude" - ${latitude}, 2) +
      POWER(("longitude" - ${longitude}) * COS(RADIANS(${latitude})), 2)
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) return null;

  const location = row.locationId
    ? await db.location.findUnique({ where: { id: row.locationId }, select: { name: true } })
    : null;

  return {
    pincode: row.pincode,
    city: row.city,
    state: row.state,
    locationId: row.locationId,
    locationName: location?.name ?? null,
  };
}
