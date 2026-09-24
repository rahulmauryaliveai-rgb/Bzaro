import type { PrismaClient } from "../../src/generated/prisma/client";

/**
 * PIN codes, NCR first (Phase 3).
 *
 * A representative sample, not the full India Post dataset — enough for the
 * picker and the nearest-pincode lookup to work end to end in every city the
 * taxonomy seeds. Importing all ~19,000 rows is a data task, not a code one:
 * drop the CSV in and extend `ROWS`, the shape is the same.
 *
 * `citySlug` maps to a `Location` row; a pincode whose city we do not model
 * yet is still useful for the lookup, and simply carries a null `locationId`.
 *
 * Coordinates are the post office's locality centre, rounded to 4 decimals
 * (~11 m) — far finer than the accuracy anything here needs.
 */

type PincodeRow = {
  pincode: string;
  city: string;
  district: string;
  state: string;
  citySlug: string | null;
  latitude: number;
  longitude: number;
};

const ROWS: PincodeRow[] = [
  // ── Delhi ──────────────────────────────────────────────────────────────────
  {
    pincode: "110001",
    city: "New Delhi",
    district: "Central Delhi",
    state: "Delhi",
    citySlug: "new-delhi",
    latitude: 28.6328,
    longitude: 77.2197,
  },
  {
    pincode: "110002",
    city: "New Delhi",
    district: "Central Delhi",
    state: "Delhi",
    citySlug: "new-delhi",
    latitude: 28.6469,
    longitude: 77.241,
  },
  {
    pincode: "110005",
    city: "New Delhi",
    district: "Central Delhi",
    state: "Delhi",
    citySlug: "new-delhi",
    latitude: 28.6469,
    longitude: 77.1855,
  },
  {
    pincode: "110006",
    city: "New Delhi",
    district: "Central Delhi",
    state: "Delhi",
    citySlug: "new-delhi",
    latitude: 28.6562,
    longitude: 77.2301,
  },
  {
    pincode: "110016",
    city: "New Delhi",
    district: "South Delhi",
    state: "Delhi",
    citySlug: "new-delhi",
    latitude: 28.5494,
    longitude: 77.1934,
  },
  {
    pincode: "110019",
    city: "New Delhi",
    district: "South Delhi",
    state: "Delhi",
    citySlug: "new-delhi",
    latitude: 28.5355,
    longitude: 77.2503,
  },
  {
    pincode: "110024",
    city: "New Delhi",
    district: "South Delhi",
    state: "Delhi",
    citySlug: "new-delhi",
    latitude: 28.5677,
    longitude: 77.2433,
  },
  {
    pincode: "110034",
    city: "New Delhi",
    district: "North West Delhi",
    state: "Delhi",
    citySlug: "new-delhi",
    latitude: 28.7041,
    longitude: 77.1525,
  },
  {
    pincode: "110048",
    city: "New Delhi",
    district: "South Delhi",
    state: "Delhi",
    citySlug: "new-delhi",
    latitude: 28.5562,
    longitude: 77.241,
  },
  {
    pincode: "110070",
    city: "New Delhi",
    district: "South West Delhi",
    state: "Delhi",
    citySlug: "new-delhi",
    latitude: 28.51,
    longitude: 77.155,
  },
  {
    pincode: "110092",
    city: "New Delhi",
    district: "East Delhi",
    state: "Delhi",
    citySlug: "new-delhi",
    latitude: 28.6692,
    longitude: 77.31,
  },

  // ── Gurugram ───────────────────────────────────────────────────────────────
  {
    pincode: "122001",
    city: "Gurugram",
    district: "Gurugram",
    state: "Haryana",
    citySlug: "gurugram",
    latitude: 28.4595,
    longitude: 77.0266,
  },
  {
    pincode: "122002",
    city: "Gurugram",
    district: "Gurugram",
    state: "Haryana",
    citySlug: "gurugram",
    latitude: 28.47,
    longitude: 77.03,
  },
  {
    pincode: "122018",
    city: "Gurugram",
    district: "Gurugram",
    state: "Haryana",
    citySlug: "gurugram",
    latitude: 28.4419,
    longitude: 77.062,
  },
  {
    pincode: "122015",
    city: "Gurugram",
    district: "Gurugram",
    state: "Haryana",
    citySlug: "gurugram",
    latitude: 28.4089,
    longitude: 77.0426,
  },

  // ── Faridabad ──────────────────────────────────────────────────────────────
  {
    pincode: "121001",
    city: "Faridabad",
    district: "Faridabad",
    state: "Haryana",
    citySlug: "faridabad",
    latitude: 28.4089,
    longitude: 77.3178,
  },
  {
    pincode: "121002",
    city: "Faridabad",
    district: "Faridabad",
    state: "Haryana",
    citySlug: "faridabad",
    latitude: 28.38,
    longitude: 77.31,
  },
  {
    pincode: "121007",
    city: "Faridabad",
    district: "Faridabad",
    state: "Haryana",
    citySlug: "faridabad",
    latitude: 28.44,
    longitude: 77.3,
  },

  // ── Noida ──────────────────────────────────────────────────────────────────
  {
    pincode: "201301",
    city: "Noida",
    district: "Gautam Buddha Nagar",
    state: "Uttar Pradesh",
    citySlug: "noida",
    latitude: 28.5706,
    longitude: 77.3272,
  },
  {
    pincode: "201303",
    city: "Noida",
    district: "Gautam Buddha Nagar",
    state: "Uttar Pradesh",
    citySlug: "noida",
    latitude: 28.51,
    longitude: 77.39,
  },
  {
    pincode: "201309",
    city: "Noida",
    district: "Gautam Buddha Nagar",
    state: "Uttar Pradesh",
    citySlug: "noida",
    latitude: 28.495,
    longitude: 77.51,
  },

  // ── Ghaziabad ──────────────────────────────────────────────────────────────
  {
    pincode: "201001",
    city: "Ghaziabad",
    district: "Ghaziabad",
    state: "Uttar Pradesh",
    citySlug: "ghaziabad",
    latitude: 28.6692,
    longitude: 77.4538,
  },
  {
    pincode: "201005",
    city: "Ghaziabad",
    district: "Ghaziabad",
    state: "Uttar Pradesh",
    citySlug: "ghaziabad",
    latitude: 28.68,
    longitude: 77.43,
  },
  {
    pincode: "201010",
    city: "Ghaziabad",
    district: "Ghaziabad",
    state: "Uttar Pradesh",
    citySlug: "ghaziabad",
    latitude: 28.64,
    longitude: 77.42,
  },

  // ── Mumbai ─────────────────────────────────────────────────────────────────
  {
    pincode: "400001",
    city: "Mumbai",
    district: "Mumbai",
    state: "Maharashtra",
    citySlug: "mumbai",
    latitude: 18.9388,
    longitude: 72.8354,
  },
  {
    pincode: "400012",
    city: "Mumbai",
    district: "Mumbai",
    state: "Maharashtra",
    citySlug: "mumbai",
    latitude: 19.001,
    longitude: 72.84,
  },
  {
    pincode: "400051",
    city: "Mumbai",
    district: "Mumbai Suburban",
    state: "Maharashtra",
    citySlug: "mumbai",
    latitude: 19.0596,
    longitude: 72.8295,
  },
  {
    pincode: "400069",
    city: "Mumbai",
    district: "Mumbai Suburban",
    state: "Maharashtra",
    citySlug: "mumbai",
    latitude: 19.1136,
    longitude: 72.8697,
  },
  {
    pincode: "400093",
    city: "Mumbai",
    district: "Mumbai Suburban",
    state: "Maharashtra",
    citySlug: "mumbai",
    latitude: 19.1075,
    longitude: 72.869,
  },

  // ── Pune ───────────────────────────────────────────────────────────────────
  {
    pincode: "411001",
    city: "Pune",
    district: "Pune",
    state: "Maharashtra",
    citySlug: "pune",
    latitude: 18.5196,
    longitude: 73.8553,
  },
  {
    pincode: "411014",
    city: "Pune",
    district: "Pune",
    state: "Maharashtra",
    citySlug: "pune",
    latitude: 18.5523,
    longitude: 73.94,
  },
  {
    pincode: "411057",
    city: "Pune",
    district: "Pune",
    state: "Maharashtra",
    citySlug: "pune",
    latitude: 18.59,
    longitude: 73.74,
  },

  // ── Nagpur ─────────────────────────────────────────────────────────────────
  {
    pincode: "440001",
    city: "Nagpur",
    district: "Nagpur",
    state: "Maharashtra",
    citySlug: "nagpur",
    latitude: 21.1458,
    longitude: 79.0882,
  },
  {
    pincode: "440010",
    city: "Nagpur",
    district: "Nagpur",
    state: "Maharashtra",
    citySlug: "nagpur",
    latitude: 21.13,
    longitude: 79.06,
  },

  // ── Ahmedabad ──────────────────────────────────────────────────────────────
  {
    pincode: "380001",
    city: "Ahmedabad",
    district: "Ahmedabad",
    state: "Gujarat",
    citySlug: "ahmedabad",
    latitude: 23.0225,
    longitude: 72.5714,
  },
  {
    pincode: "380015",
    city: "Ahmedabad",
    district: "Ahmedabad",
    state: "Gujarat",
    citySlug: "ahmedabad",
    latitude: 23.01,
    longitude: 72.51,
  },

  // ── Surat ──────────────────────────────────────────────────────────────────
  {
    pincode: "395003",
    city: "Surat",
    district: "Surat",
    state: "Gujarat",
    citySlug: "surat",
    latitude: 21.1702,
    longitude: 72.8311,
  },
  {
    pincode: "395007",
    city: "Surat",
    district: "Surat",
    state: "Gujarat",
    citySlug: "surat",
    latitude: 21.19,
    longitude: 72.8,
  },

  // ── Chennai ────────────────────────────────────────────────────────────────
  {
    pincode: "600001",
    city: "Chennai",
    district: "Chennai",
    state: "Tamil Nadu",
    citySlug: "chennai",
    latitude: 13.091,
    longitude: 80.29,
  },
  {
    pincode: "600032",
    city: "Chennai",
    district: "Chennai",
    state: "Tamil Nadu",
    citySlug: "chennai",
    latitude: 13.01,
    longitude: 80.21,
  },

  // ── Lucknow ────────────────────────────────────────────────────────────────
  {
    pincode: "226001",
    city: "Lucknow",
    district: "Lucknow",
    state: "Uttar Pradesh",
    citySlug: "lucknow",
    latitude: 26.8467,
    longitude: 80.9462,
  },
  {
    pincode: "226010",
    city: "Lucknow",
    district: "Lucknow",
    state: "Uttar Pradesh",
    citySlug: "lucknow",
    latitude: 26.86,
    longitude: 80.99,
  },
];

export async function seedPincodes(prisma: PrismaClient): Promise<number> {
  const cities = await prisma.location.findMany({
    where: { type: "CITY" },
    select: { id: true, slug: true },
  });
  const idBySlug = new Map(cities.map((city) => [city.slug.toLowerCase(), city.id]));

  for (const row of ROWS) {
    const locationId = row.citySlug ? (idBySlug.get(row.citySlug) ?? null) : null;
    const data = {
      city: row.city,
      district: row.district,
      state: row.state,
      locationId,
      latitude: row.latitude,
      longitude: row.longitude,
    };

    await prisma.pincode.upsert({
      where: { pincode: row.pincode },
      create: { pincode: row.pincode, ...data },
      update: data,
    });
  }

  return ROWS.length;
}
