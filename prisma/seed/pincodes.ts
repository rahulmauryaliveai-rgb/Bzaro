import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PrismaClient } from "../../src/generated/prisma/client";

/**
 * PIN codes: every Indian PIN code, mapped to our cities where we have them.
 *
 * 1. `data/in-pincodes.csv` — all ~19,300 PIN codes from India Post's
 *    directory (Government Open Data License - India), one row each with
 *    district, state and a cleaned coordinate. Built and documented by
 *    scripts/pincodes/build-in-pincodes.py; coordinates the source got wrong
 *    are dropped, not guessed.
 * 2. Each PIN code is linked to a `Location` city by CITY_RULES below:
 *    same state, one of the city's districts, and within `maxKm` of the city
 *    centre. When two cities share a district (Noida / Greater Noida) the
 *    nearer centre wins. A PIN code outside every rule falls back to a city
 *    whose slug equals its district's, in the same state. Anything else keeps
 *    a null `locationId`: it still resolves ("we know Anantapur, but have no
 *    sellers there yet"), it just is not a marketplace city.
 * 3. CURATED rows (hand-checked, NCR first) are applied last and win.
 *
 * Idempotent: an upsert keyed on `pincode`. Re-run after adding a city to the
 * taxonomy (and a rule here if its name differs from its district's).
 */

type CityRule = {
  /** Location slugs to try, first match wins (covers renames and typos). */
  slugs: string[];
  state: string;
  /** Upper-case India Post district names, or "*" for the whole state. */
  districts: string[] | "*";
  centre: [number, number];
  maxKm?: number;
};

const DEFAULT_MAX_KM = 60;

const CITY_RULES: CityRule[] = [
  { slugs: ["new-delhi", "delhi"], state: "DELHI", districts: "*", centre: [28.6139, 77.209] },
  { slugs: ["noida"], state: "UTTAR PRADESH", districts: ["GAUTAM BUDDHA NAGAR"], centre: [28.5355, 77.391] },
  { slugs: ["greater-noida"], state: "UTTAR PRADESH", districts: ["GAUTAM BUDDHA NAGAR"], centre: [28.4744, 77.504] },
  { slugs: ["ghaziabad"], state: "UTTAR PRADESH", districts: ["GHAZIABAD"], centre: [28.6692, 77.4538] },
  { slugs: ["meerut", "meetut"], state: "UTTAR PRADESH", districts: ["MEERUT"], centre: [28.9845, 77.7064] },
  { slugs: ["lucknow"], state: "UTTAR PRADESH", districts: ["LUCKNOW"], centre: [26.8467, 80.9462] },
  { slugs: ["ayodhya", "faizabad"], state: "UTTAR PRADESH", districts: ["AYODHYA", "FAIZABAD"], centre: [26.773, 82.1458] },
  { slugs: ["gurugram", "gurgaon"], state: "HARYANA", districts: ["GURUGRAM", "GURGAON"], centre: [28.4595, 77.0266] },
  { slugs: ["faridabad"], state: "HARYANA", districts: ["FARIDABAD"], centre: [28.4089, 77.3178] },
  {
    // Mumbai Metropolitan Region: Thane and Navi Mumbai buyers shop Mumbai sellers.
    slugs: ["mumbai"],
    state: "MAHARASHTRA",
    districts: ["MUMBAI", "MUMBAI SUBURBAN", "THANE", "RAIGAD", "RAIGARH", "PALGHAR"],
    centre: [19.076, 72.8777],
    maxKm: 40,
  },
  { slugs: ["pune"], state: "MAHARASHTRA", districts: ["PUNE"], centre: [18.5204, 73.8567] },
  { slugs: ["nagpur"], state: "MAHARASHTRA", districts: ["NAGPUR"], centre: [21.1458, 79.0882] },
  { slugs: ["ahmedabad"], state: "GUJARAT", districts: ["AHMADABAD", "AHMEDABAD"], centre: [23.0225, 72.5714] },
  { slugs: ["surat"], state: "GUJARAT", districts: ["SURAT"], centre: [21.1702, 72.8311] },
  {
    slugs: ["chennai"],
    state: "TAMIL NADU",
    districts: ["CHENNAI", "CHENGALPATTU", "KANCHIPURAM", "TIRUVALLUR", "THIRUVALLUR"],
    centre: [13.0827, 80.2707],
    maxKm: 35,
  },
];

type IndiaRow = {
  pincode: string;
  district: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
};

function readIndiaRows(): IndiaRow[] {
  const file = join(process.cwd(), "prisma", "seed", "data", "in-pincodes.csv");
  const lines = readFileSync(file, "utf8").split(/\r?\n/).slice(1);
  const rows: IndiaRow[] = [];
  for (const line of lines) {
    if (!line) continue;
    const [pincode, district, state, lat, lng] = line.split(",");
    if (!pincode || !district || !state) continue;
    rows.push({
      pincode,
      district,
      state,
      latitude: lat ? Number(lat) : null,
      longitude: lng ? Number(lng) : null,
    });
  }
  return rows;
}

function km(a: [number, number], b: [number, number]): number {
  const mid = (((a[0] + b[0]) / 2) * Math.PI) / 180;
  return Math.hypot((a[0] - b[0]) * 111.2, (a[1] - b[1]) * 111.2 * Math.cos(mid));
}

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

type City = { id: string; slug: string; name: string; path: string };

/** The Location city a PIN code belongs to, or null. Exported for tests. */
export function matchCity(row: IndiaRow, citiesBySlug: Map<string, City>): City | null {
  const state = row.state.toUpperCase();
  const district = row.district.toUpperCase();
  const point: [number, number] | null =
    row.latitude !== null && row.longitude !== null ? [row.latitude, row.longitude] : null;

  let best: { city: City; distance: number } | null = null;
  let covered = false;
  for (const rule of CITY_RULES) {
    if (rule.state !== state) continue;
    if (rule.districts !== "*" && !rule.districts.includes(district)) continue;
    const city = rule.slugs.map((slug) => citiesBySlug.get(slug)).find(Boolean);
    if (!city) continue;
    covered = true;
    // No trustworthy coordinate: the district alone decides, first rule wins.
    const distance = point ? km(point, rule.centre) : 0;
    if (distance > (rule.maxKm ?? DEFAULT_MAX_KM)) continue;
    if (!best || distance < best.distance) best = { city, distance };
  }
  if (best) return best.city;
  // A rule knew this district and judged it too far out: no fallback.
  if (covered) return null;

  const sameName = citiesBySlug.get(slugify(row.district));
  if (sameName && sameName.path.startsWith(`/in/${slugify(row.state)}/`)) return sameName;
  return null;
}

async function seedIndiaPincodes(prisma: PrismaClient): Promise<number> {
  const cities = await prisma.location.findMany({
    where: { type: "CITY" },
    select: { id: true, slug: true, name: true, path: true },
  });
  const citiesBySlug = new Map(cities.map((city) => [city.slug.toLowerCase(), city]));

  const rows = readIndiaRows();
  const mapped = new Map<string, number>();
  const CHUNK = 2000;

  for (let start = 0; start < rows.length; start += CHUNK) {
    const chunk = rows.slice(start, start + CHUNK);
    const pins: string[] = [];
    const names: string[] = [];
    const districts: string[] = [];
    const states: string[] = [];
    const locationIds: (string | null)[] = [];
    const lats: (number | null)[] = [];
    const lngs: (number | null)[] = [];

    for (const row of chunk) {
      const city = matchCity(row, citiesBySlug);
      if (city) mapped.set(city.name, (mapped.get(city.name) ?? 0) + 1);
      pins.push(row.pincode);
      names.push(city?.name ?? row.district);
      districts.push(row.district);
      states.push(row.state);
      locationIds.push(city?.id ?? null);
      lats.push(row.latitude);
      lngs.push(row.longitude);
    }

    await prisma.$executeRaw`
      INSERT INTO "Pincode" ("pincode", "city", "district", "state", "locationId", "latitude", "longitude")
      SELECT * FROM unnest(
        ${pins}::text[], ${names}::text[], ${districts}::text[], ${states}::text[],
        ${locationIds}::text[], ${lats}::float8[], ${lngs}::float8[]
      )
      ON CONFLICT ("pincode") DO UPDATE SET
        "city" = EXCLUDED."city",
        "district" = EXCLUDED."district",
        "state" = EXCLUDED."state",
        "locationId" = EXCLUDED."locationId",
        "latitude" = EXCLUDED."latitude",
        "longitude" = EXCLUDED."longitude"
    `;
  }

  const summary = [...mapped.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `${name} ${count}`)
    .join(", ");
  console.log(`   ${rows.length} India Post PIN codes; linked to a city: ${summary || "none"}`);
  return rows.length;
}

/** Hand-checked rows (NCR first). Applied after the India Post import and win. */
type PincodeRow = {
  pincode: string;
  city: string;
  district: string;
  state: string;
  citySlug: string | null;
  latitude: number;
  longitude: number;
};

const CURATED: PincodeRow[] = [
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

  // ── Greater Noida ─────────────────────────────────────────────────────────
  // India Post puts 201306's offices nearer Noida's centre, and has no 201308
  // at all; both are Greater Noida.
  {
    pincode: "201306",
    city: "Greater Noida",
    district: "Gautam Buddha Nagar",
    state: "Uttar Pradesh",
    citySlug: "greater-noida",
    latitude: 28.5,
    longitude: 77.49,
  },
  {
    pincode: "201308",
    city: "Greater Noida",
    district: "Gautam Buddha Nagar",
    state: "Uttar Pradesh",
    citySlug: "greater-noida",
    latitude: 28.47,
    longitude: 77.51,
  },
  {
    pincode: "201310",
    city: "Greater Noida",
    district: "Gautam Buddha Nagar",
    state: "Uttar Pradesh",
    citySlug: "greater-noida",
    latitude: 28.46,
    longitude: 77.49,
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
  const total = await seedIndiaPincodes(prisma);

  const cities = await prisma.location.findMany({
    where: { type: "CITY" },
    select: { id: true, slug: true },
  });
  const idBySlug = new Map(cities.map((city) => [city.slug.toLowerCase(), city.id]));

  for (const row of CURATED) {
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

  return total;
}
