import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { config as loadEnv } from "dotenv";
import { hash } from "@node-rs/argon2";
import { randomBytes, createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { PrismaClient } from "../../src/generated/prisma/client";
import { seedPlans } from "./plans";
import { seedTemplates } from "./templates";
import { seedTaxonomy } from "./taxonomy";
import {
  ABC_PRODUCTS,
  ABC_SERVICES,
  VERMA_PRODUCTS,
  VERMA_SERVICES,
  image,
  seedSellerCatalog,
  type ProductFixture,
  type ServiceFixture,
} from "./catalog";

/**
 * Showcase seed — demo sellers for presenting the LIVE platform.
 *
 * Production has no demo data by default (`production.ts`). This adds a
 * handful of believable, fully populated sellers so every screen has
 * something on it when the platform is shown to prospective sellers:
 * six Gold-plan storefronts on different templates, categories and cities,
 * each with products, services and a gallery, plus a few open buyer
 * requirements so the lead inbox and the admin queue are not empty.
 *
 * Differences from the development seed, all deliberate:
 *   - every slug starts with `demo-` and every login is `demo-*@bzaro.in`,
 *     so the whole set can be removed in one go:  --remove
 *   - passwords are random per run and written to DEMO_CREDENTIALS_FILE
 *     (default ./demo-credentials.txt, chmod 600) — never a shared default
 *   - phone numbers are the reserved 99999-xxxxx range, so a "Call" button
 *     during a demo never rings a real person
 *   - storefronts are marked non-indexable: search engines must not learn
 *     these businesses exist
 *
 * Idempotent: re-running updates in place and does not reset passwords.
 *
 *   npm run db:seed:showcase             create / refresh
 *   npm run db:seed:showcase -- --remove  delete everything it created
 */

const nodeEnv = process.env.NODE_ENV ?? "development";
for (const file of [`.env.${nodeEnv}.local`, ".env.local", `.env.${nodeEnv}`, ".env"]) {
  loadEnv({ path: file, quiet: true });
}

const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set.");

const REMOVE = process.argv.includes("--remove");
const CREDENTIALS_FILE = process.env.DEMO_CREDENTIALS_FILE ?? "demo-credentials.txt";
const PREFIX = "demo-";
const DEMO_BUYER_PHONE = "+919999900001";

const pool = new Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

type Showcase = {
  slug: string;
  businessName: string;
  tagline: string;
  description: string;
  templateKey: string;
  city: string;
  categorySlug: string;
  secondaryCategorySlugs?: string[];
  businessType: "MANUFACTURER" | "WHOLESALER" | "DISTRIBUTOR" | "TRADER" | "SERVICE_PROVIDER";
  establishedYear: number;
  employeeCount: string;
  gstin: string;
  products: ProductFixture[];
  services: ServiceFixture[];
  galleryCount: number;
};

// ── Catalogue fixtures for the sellers the dev seed does not cover ───────────

const STEEL_PRODUCTS: ProductFixture[] = [
  {
    slug: "tmt-bar-12mm-fe500d",
    name: "TMT Bar 12mm Fe500D",
    shortDescription: "Earthquake-resistant Fe500D rebar, IS 1786, 12 m standard length.",
    description:
      "Thermo-mechanically treated reinforcement bars with a tempered martensite rim and " +
      "ductile ferrite-pearlite core. Uniform rib pattern for bond strength; bend and " +
      "re-bend tested per IS 1786. Supplied in 12 m lengths, bundled and tagged by heat number.",
    brand: "Sharma Steel",
    sku: "SST-TMT-12",
    categorySlug: "tmt-bars",
    priceMinor: 5_650_000,
    unit: "tonne",
    minOrderQty: 2,
    specifications: [
      { key: "Grade", value: "Fe500D" },
      { key: "Diameter", value: "12 mm" },
      { key: "Length", value: "12 m" },
      { key: "Standard", value: "IS 1786:2008" },
    ],
    tags: ["tmt", "rebar", "construction"],
    images: 2,
    featured: true,
  },
  {
    slug: "tmt-bar-16mm-fe500d",
    name: "TMT Bar 16mm Fe500D",
    shortDescription: "16 mm Fe500D rebar for columns and beams; mill test certificate supplied.",
    categorySlug: "tmt-bars",
    priceMinor: 5_600_000,
    unit: "tonne",
    minOrderQty: 2,
    images: 1,
  },
  {
    slug: "ms-square-pipe-50x50",
    name: "MS Square Pipe 50×50×2 mm",
    shortDescription: "ERW mild steel hollow section, 6 m length, black or galvanised.",
    categorySlug: "steel-pipes",
    priceMinor: 6_200_000,
    unit: "tonne",
    minOrderQty: 1,
    specifications: [
      { key: "Size", value: "50 × 50 mm" },
      { key: "Thickness", value: "2.0 mm" },
      { key: "Length", value: "6 m" },
    ],
    images: 2,
  },
  {
    slug: "gi-round-pipe-2-inch",
    name: 'GI Round Pipe 2" Medium',
    shortDescription: "Hot-dip galvanised, IS 1239 medium class, threaded and socketed.",
    categorySlug: "steel-pipes",
    unit: "tonne",
    images: 1,
  },
];

const STEEL_SERVICES: ServiceFixture[] = [
  {
    slug: "cut-and-bend",
    name: "Cut & Bend Rebar Service",
    shortDescription:
      "Bar bending schedules executed to drawing, delivered to site tagged by member.",
    categorySlug: "tmt-bars",
    pricingModel: "per tonne",
    serviceAreas: ["Pune", "Pimpri-Chinchwad", "Satara"],
    deliverables: ["BBS review", "Cut-to-length", "Bent per IS 2502", "Site delivery"],
    featured: true,
  },
];

const MEDICAL_PRODUCTS: ProductFixture[] = [
  {
    slug: "nitrile-gloves-powder-free",
    name: "Nitrile Examination Gloves, Powder-Free",
    shortDescription: "Blue, textured fingertips, AQL 1.5, box of 100. Sizes S–XL.",
    description:
      "Single-use nitrile examination gloves, latex-free and powder-free. Beaded cuff, " +
      "textured fingertips for wet grip. Conforms to EN 455 and ASTM D6319; CDSCO registered.",
    brand: "MediCare",
    sku: "MC-NG-100",
    categorySlug: "medical-disposables",
    priceMinor: 42_000,
    unit: "box of 100",
    minOrderQty: 50,
    specifications: [
      { key: "Material", value: "Nitrile" },
      { key: "AQL", value: "1.5" },
      { key: "Thickness (palm)", value: "0.10 mm" },
      { key: "Sterility", value: "Non-sterile" },
    ],
    tags: ["gloves", "ppe", "hospital"],
    images: 2,
    featured: true,
  },
  {
    slug: "3-ply-surgical-mask",
    name: "3-Ply Surgical Face Mask",
    shortDescription: "Melt-blown filter layer, BFE ≥ 98%, ear-loop, box of 50.",
    categorySlug: "medical-disposables",
    priceMinor: 9_500,
    unit: "box of 50",
    minOrderQty: 100,
    images: 1,
  },
  {
    slug: "digital-bp-monitor",
    name: "Digital BP Monitor, Upper Arm",
    shortDescription:
      "Automatic oscillometric monitor with irregular-heartbeat detection, 2×90 memory.",
    categorySlug: "diagnostic-equipment",
    priceMinor: 189_000,
    unit: "piece",
    minOrderQty: 10,
    specifications: [
      { key: "Measurement", value: "Oscillometric" },
      { key: "Cuff", value: "22–42 cm" },
      { key: "Power", value: "4 × AA / USB" },
      { key: "Warranty", value: "2 years" },
    ],
    images: 2,
  },
  {
    slug: "stainless-surgical-scissors-set",
    name: "Stainless Steel Surgical Scissors Set",
    shortDescription: "Mayo, Metzenbaum and iris scissors, SS 410, autoclavable. Set of 6.",
    categorySlug: "surgical-instruments",
    unit: "set",
    images: 1,
  },
  {
    slug: "hospital-bed-semi-fowler",
    name: "Semi-Fowler Hospital Bed",
    shortDescription: "Two-function manual bed, ABS panels, collapsible side rails, castor wheels.",
    categorySlug: "hospital-equipment",
    priceMinor: 2_450_000,
    unit: "piece",
    minOrderQty: 2,
    images: 2,
  },
];

const MEDICAL_SERVICES: ServiceFixture[] = [
  {
    slug: "hospital-consumables-supply",
    name: "Monthly Consumables Supply Contract",
    shortDescription:
      "Scheduled supply of disposables to hospitals and clinics with stock-level reporting.",
    categorySlug: "medical-disposables",
    pricingModel: "monthly contract",
    serviceAreas: ["Delhi NCR"],
    deliverables: ["Fortnightly delivery", "Consumption report", "Emergency top-up within 24 h"],
    featured: true,
  },
];

const SPICE_PRODUCTS: ProductFixture[] = [
  {
    slug: "turmeric-powder-bulk",
    name: "Turmeric Powder, 3% Curcumin",
    shortDescription:
      "Salem-origin, steam-sterilised, 25 kg PP bags with liner. Lab report per lot.",
    description:
      "Ground from cured Salem fingers, steam-sterilised to reduce microbial load without " +
      "affecting colour. Curcumin 3% minimum, moisture below 10%. FSSAI licensed unit; " +
      "AGMARK and lab analysis supplied with every lot.",
    brand: "Kerala Spice Co",
    sku: "KSC-TUR-25",
    categorySlug: "spices-masala",
    priceMinor: 18_500,
    unit: "kg",
    minOrderQty: 100,
    specifications: [
      { key: "Curcumin", value: "≥ 3%" },
      { key: "Moisture", value: "≤ 10%" },
      { key: "Packing", value: "25 kg PP bag" },
      { key: "Shelf life", value: "18 months" },
    ],
    tags: ["turmeric", "haldi", "spices"],
    images: 2,
    featured: true,
  },
  {
    slug: "black-pepper-whole-550gl",
    name: "Black Pepper Whole, 550 GL",
    shortDescription: "Malabar garbled, 550 g/l bulk density, machine-cleaned, 50 kg jute bags.",
    categorySlug: "spices-masala",
    priceMinor: 62_000,
    unit: "kg",
    minOrderQty: 50,
    images: 2,
  },
  {
    slug: "red-chilli-powder-teja",
    name: "Red Chilli Powder, Teja S17",
    shortDescription: "High-pungency Guntur Teja, 60,000–80,000 SHU, sun-dried and stone-ground.",
    categorySlug: "spices-masala",
    priceMinor: 24_000,
    unit: "kg",
    minOrderQty: 100,
    images: 1,
  },
  {
    slug: "cardamom-green-8mm",
    name: "Green Cardamom, 8 mm Bold",
    shortDescription:
      "Idukki-grown, 8 mm+ bold pods, machine graded, 1 kg vacuum packs in 25 kg cartons.",
    categorySlug: "spices-masala",
    unit: "kg",
    images: 1,
  },
  {
    slug: "cumin-seeds-europe-quality",
    name: "Cumin Seeds, Europe Quality",
    shortDescription: "99% purity, machine-cleaned and sortex, Unjha origin.",
    categorySlug: "spices-masala",
    priceMinor: 31_000,
    unit: "kg",
    minOrderQty: 100,
    images: 1,
  },
];

const SPICE_SERVICES: ServiceFixture[] = [
  {
    slug: "private-label-packing",
    name: "Private Label Spice Packing",
    shortDescription:
      "Blending, grinding and retail packing under your brand from 100 g pouches to 5 kg.",
    categorySlug: "spices-masala",
    pricingModel: "per kg + packaging",
    serviceAreas: ["Pan India", "Export"],
    deliverables: ["Recipe blending", "Nitrogen-flushed packing", "FSSAI label compliance"],
  },
];

const AUTO_PRODUCTS: ProductFixture[] = [
  {
    slug: "brake-pad-set-commercial",
    name: "Brake Pad Set, Commercial Vehicle",
    shortDescription:
      "Semi-metallic pads for Tata / Ashok Leyland LCVs; asbestos-free, shim-backed.",
    description:
      "Semi-metallic friction material bonded to a powder-coated backing plate with an " +
      "anti-noise shim. Copper-free formulation, tested on inertia dynamometer to ECE R90.",
    brand: "Rathi Auto",
    sku: "RA-BP-CV-01",
    categorySlug: "truck-bus-parts",
    priceMinor: 185_000,
    unit: "set",
    minOrderQty: 20,
    specifications: [
      { key: "Material", value: "Semi-metallic, asbestos-free" },
      { key: "Fitment", value: "Tata 407 / LPT 709, AL Dost" },
      { key: "Standard", value: "ECE R90" },
    ],
    tags: ["brake", "lcv", "spares"],
    images: 2,
    featured: true,
  },
  {
    slug: "led-headlamp-h4-truck",
    name: "LED Headlamp Bulb H4, 24 V",
    shortDescription:
      "6000 K, 4000 lm per bulb, IP67, fan-cooled, plug-and-play for 24 V trucks and buses.",
    categorySlug: "auto-electricals",
    priceMinor: 95_000,
    unit: "pair",
    minOrderQty: 10,
    images: 2,
  },
  {
    slug: "two-wheeler-clutch-plate",
    name: "Two-Wheeler Clutch Plate Set",
    shortDescription: "Cork friction plates for 100–150 cc Hero / Bajaj / TVS models. Set of 4–5.",
    categorySlug: "two-wheeler-parts",
    priceMinor: 32_000,
    unit: "set",
    minOrderQty: 50,
    images: 1,
  },
  {
    slug: "engine-oil-15w40-ci4",
    name: "Diesel Engine Oil 15W-40 CI-4+",
    shortDescription: "Heavy-duty diesel engine oil in 20 L and 50 L drums; API CI-4 Plus.",
    categorySlug: "auto-lubricants",
    priceMinor: 520_000,
    unit: "50 L drum",
    minOrderQty: 4,
    images: 1,
  },
  {
    slug: "12v-100ah-truck-battery",
    name: "12 V 100 Ah Truck Battery",
    shortDescription: "Flooded lead-acid, 18-month warranty, N100 dimensions.",
    categorySlug: "auto-batteries",
    unit: "piece",
    images: 1,
  },
];

const AUTO_SERVICES: ServiceFixture[] = [
  {
    slug: "fleet-spares-supply",
    name: "Fleet Spares Supply Programme",
    shortDescription:
      "Consolidated monthly spares supply for transport fleets with consignment stock at your depot.",
    categorySlug: "truck-bus-parts",
    pricingModel: "monthly",
    serviceAreas: ["Jaipur", "Delhi NCR", "Rajasthan"],
    deliverables: ["Consignment stock", "Monthly reconciliation", "Same-day critical spares"],
  },
];

// ── The showcase sellers ─────────────────────────────────────────────────────

const SHOWCASE: Showcase[] = [
  {
    slug: "demo-abc-electronics",
    businessName: "ABC Electronics",
    tagline: "LED lighting manufacturer since 2009",
    description:
      "ABC Electronics designs and manufactures LED panels, bulbs and industrial luminaires at " +
      "its Mumbai plant. BIS-certified range, in-house driver production and a two-year " +
      "replacement warranty on every fitting. Supplying electrical contractors, builders and " +
      "institutional buyers across western India.",
    templateKey: "electro",
    city: "mumbai",
    categorySlug: "led-bulbs",
    secondaryCategorySlugs: ["led-panels", "industrial-lights"],
    businessType: "MANUFACTURER",
    establishedYear: 2009,
    employeeCount: "51-200",
    gstin: "27AAACA1234A1Z5",
    products: ABC_PRODUCTS,
    services: ABC_SERVICES,
    galleryCount: 8,
  },
  {
    slug: "demo-sharma-steel",
    businessName: "Sharma Steel Traders",
    tagline: "TMT bars, pipes and structural steel — ex-stock Pune",
    description:
      "Authorised distributor for primary TMT brands with a 1,200-tonne stockyard in Chakan. " +
      "Cut-and-bend service, same-day dispatch within Pune and credit terms for registered " +
      "contractors.",
    templateKey: "autoparts",
    city: "pune",
    categorySlug: "tmt-bars",
    secondaryCategorySlugs: ["steel-pipes"],
    businessType: "DISTRIBUTOR",
    establishedYear: 2003,
    employeeCount: "11-50",
    gstin: "27AAFCS5678B1Z2",
    products: STEEL_PRODUCTS,
    services: STEEL_SERVICES,
    galleryCount: 6,
  },
  {
    slug: "demo-medicare-supplies",
    businessName: "MediCare Hospital Supplies",
    tagline: "Disposables, diagnostics and hospital furniture for clinics and hospitals",
    description:
      "MediCare supplies over 400 hospitals and diagnostic centres in Delhi NCR with " +
      "consumables, monitoring equipment and ward furniture. CDSCO-licensed wholesale " +
      "drug licence holder; cold-chain capable; fortnightly scheduled deliveries.",
    templateKey: "medico",
    city: "new-delhi",
    categorySlug: "medical-disposables",
    secondaryCategorySlugs: ["diagnostic-equipment", "hospital-equipment", "surgical-instruments"],
    businessType: "WHOLESALER",
    establishedYear: 2012,
    employeeCount: "11-50",
    gstin: "07AAHCM9012C1Z8",
    products: MEDICAL_PRODUCTS,
    services: MEDICAL_SERVICES,
    galleryCount: 5,
  },
  {
    slug: "demo-kerala-spice-co",
    businessName: "Kerala Spice Co",
    tagline: "Farm-sourced spices from Idukki and Salem, packed for wholesale and export",
    description:
      "Kerala Spice Co works directly with grower collectives in Idukki, Salem and Guntur. " +
      "FSSAI-licensed processing unit with steam sterilisation and sortex cleaning; " +
      "AGMARK-graded lots with lab reports. Private-label packing for retailers and exporters.",
    templateKey: "fresh",
    city: "chennai",
    categorySlug: "spices-masala",
    secondaryCategorySlugs: ["dry-fruits"],
    businessType: "MANUFACTURER",
    establishedYear: 1998,
    employeeCount: "51-200",
    gstin: "33AABCK3456D1Z1",
    products: SPICE_PRODUCTS,
    services: SPICE_SERVICES,
    galleryCount: 6,
  },
  {
    slug: "demo-rathi-auto-parts",
    businessName: "Rathi Auto Parts",
    tagline: "Commercial vehicle and two-wheeler spares — 12,000 SKUs ex-stock",
    description:
      "Rathi Auto Parts stocks genuine and OE-equivalent spares for trucks, buses and " +
      "two-wheelers, with fleet supply programmes for transporters across Rajasthan and " +
      "Delhi NCR. Same-day dispatch on critical parts.",
    templateKey: "autoparts",
    city: "new-delhi",
    categorySlug: "truck-bus-parts",
    secondaryCategorySlugs: ["auto-electricals", "two-wheeler-parts", "auto-lubricants"],
    businessType: "TRADER",
    establishedYear: 2006,
    employeeCount: "11-50",
    gstin: "07AAGFR7890E1Z4",
    products: AUTO_PRODUCTS,
    services: AUTO_SERVICES,
    galleryCount: 5,
  },
  {
    slug: "demo-verma-plastics",
    businessName: "Verma Plastics",
    tagline: "Industrial textiles, tarpaulins and technical fabrics",
    description:
      "Verma Plastics manufactures HDPE and PP woven fabrics, tarpaulins and industrial " +
      "textiles at its Ahmedabad unit, supplying agriculture, logistics and construction " +
      "buyers nationwide.",
    templateKey: "minimal",
    city: "ahmedabad",
    categorySlug: "industrial-textiles",
    businessType: "MANUFACTURER",
    establishedYear: 2011,
    employeeCount: "51-200",
    gstin: "24AADCV2345F1Z7",
    products: VERMA_PRODUCTS,
    services: VERMA_SERVICES,
    galleryCount: 5,
  },
];

/** Open buyer requirements — the worker fans them out to matching demo sellers. */
const REQUIREMENTS = [
  {
    productName: "LED panel lights 40W",
    categorySlug: "led-panels",
    city: "mumbai",
    quantity: 500,
    quantityUnit: "pieces",
    timeline: "WITHIN_WEEK",
    purpose: "BUSINESS_USE",
    notes: "For a new office fit-out in Andheri. Need BIS-certified, 4000K. Please quote with GST.",
  },
  {
    productName: "TMT bars 12mm Fe500D",
    categorySlug: "tmt-bars",
    city: "pune",
    quantity: 20,
    quantityUnit: "tonnes",
    timeline: "IMMEDIATE",
    purpose: "BUSINESS_USE",
    notes: "Site at Hinjewadi. Delivery within 3 days; cut-and-bend preferred.",
  },
  {
    productName: "Nitrile gloves powder-free",
    categorySlug: "medical-disposables",
    city: "new-delhi",
    quantity: 2000,
    quantityUnit: "boxes",
    timeline: "WITHIN_MONTH",
    purpose: "RESALE",
    notes: "Monthly requirement for a chain of clinics. Looking for a long-term supplier.",
  },
  {
    productName: "Turmeric powder bulk",
    categorySlug: "spices-masala",
    city: "chennai",
    quantity: 1000,
    quantityUnit: "kg",
    timeline: "WITHIN_WEEK",
    purpose: "RESALE",
    notes: "Need curcumin report per lot. 25 kg bags.",
  },
] as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

function password(): string {
  return randomBytes(18).toString("base64url");
}

/** Reserved-looking Indian mobile: 99999 + 5 digits, unique per index. */
function demoPhone(index: number): string {
  return `+9199999${String(10000 + index).slice(-5)}`;
}

function fingerprint(productName: string, categoryId: string): string {
  return createHash("sha256").update(`${productName.toLowerCase()}|${categoryId}`).digest("hex");
}

// ── Remove ───────────────────────────────────────────────────────────────────

async function remove() {
  const sellers = await prisma.seller.findMany({
    where: { slug: { startsWith: PREFIX } },
    select: { id: true, slug: true },
  });
  const users = await prisma.user.findMany({
    where: { email: { startsWith: PREFIX, endsWith: "@bzaro.in" } },
    select: { id: true },
  });
  const buyer = await prisma.buyer.findUnique({ where: { phone: DEMO_BUYER_PHONE } });

  // Requirements cascade to leads/deliveries; sellers cascade to their catalogue.
  if (buyer) await prisma.requirement.deleteMany({ where: { buyerId: buyer.id } });
  if (buyer) await prisma.buyer.delete({ where: { id: buyer.id } });
  for (const seller of sellers) {
    await prisma.seller.delete({ where: { id: seller.id } });
    console.log(`   removed ${seller.slug}`);
  }
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  console.log(`\n✓ removed ${sellers.length} showcase sellers, ${users.length} logins, demo buyer`);
}

// ── Create / refresh ─────────────────────────────────────────────────────────

async function create() {
  console.log("→ reference data");
  const plans = await seedPlans(prisma);
  const templates = await seedTemplates(prisma);
  const taxonomy = await seedTaxonomy(prisma);
  const gold = plans.gold;
  if (!gold) throw new Error("Gold plan missing — run db:seed:prod first.");
  const goldPlan = await prisma.plan.findUniqueOrThrow({
    where: { id: gold.id },
    select: { leadCreditsPerMonth: true, webPresence: true },
  });

  const credentials: string[] = [];
  const now = new Date();
  const periodKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  console.log("→ showcase sellers");
  for (const [index, fixture] of SHOWCASE.entries()) {
    const email = `${fixture.slug}@bzaro.in`;
    const phone = demoPhone(index + 1);
    const locationId = taxonomy.locations[fixture.city];
    const categoryId = taxonomy.categories[fixture.categorySlug];
    if (!locationId || !categoryId) {
      throw new Error(`${fixture.slug}: unknown city or category`);
    }

    // Login. Password only on first creation — re-runs never rotate it.
    let user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) {
      const plain = password();
      user = await prisma.user.create({
        data: {
          email,
          name: `${fixture.businessName} Owner`,
          passwordHash: await hash(plain),
          role: "SELLER_OWNER",
          emailVerified: now,
          phone,
          phoneVerified: now,
        },
        select: { id: true },
      });
      credentials.push(`${email}  ${plain}`);
    }

    const seller = await prisma.seller.upsert({
      where: { slug: fixture.slug },
      create: {
        slug: fixture.slug,
        businessName: fixture.businessName,
        tagline: fixture.tagline,
        description: fixture.description,
        status: "VERIFIED",
        verifiedAt: now,
        email,
        phone,
        whatsapp: phone,
        gstin: fixture.gstin,
        gstinVerifiedAt: now,
        logoUrl: image(`${fixture.slug}-logo`, 200, 200),
        coverImageUrl: image(`${fixture.slug}-cover`, 1600, 600),
        addressLine1: "Plot 14, Industrial Estate",
        postalCode: "400001",
        locationId,
        establishedYear: fixture.establishedYear,
        employeeCount: fixture.employeeCount,
        businessType: fixture.businessType,
        onboardingStep: "COMPLETE",
        timezone: "Asia/Kolkata",
        productCount: 0,
        serviceCount: 0,
        socialLinks: {
          linkedin: `https://linkedin.com/company/${fixture.slug.slice(PREFIX.length)}`,
        },
        businessHours: {
          mon: [{ open: "09:30", close: "18:30" }],
          tue: [{ open: "09:30", close: "18:30" }],
          wed: [{ open: "09:30", close: "18:30" }],
          thu: [{ open: "09:30", close: "18:30" }],
          fri: [{ open: "09:30", close: "18:30" }],
          sat: [{ open: "10:00", close: "14:00" }],
        },
      },
      update: {
        businessName: fixture.businessName,
        tagline: fixture.tagline,
        description: fixture.description,
        status: "VERIFIED",
        onboardingStep: "COMPLETE",
        logoUrl: image(`${fixture.slug}-logo`, 200, 200),
        coverImageUrl: image(`${fixture.slug}-cover`, 1600, 600),
        deletedAt: null,
      },
      select: { id: true },
    });

    await prisma.sellerMember.upsert({
      where: { userId_sellerId: { userId: user.id, sellerId: seller.id } },
      create: { userId: user.id, sellerId: seller.id, role: "SELLER_OWNER" },
      update: {},
    });

    await prisma.sellerCategory.upsert({
      where: { sellerId_categoryId: { sellerId: seller.id, categoryId } },
      create: { sellerId: seller.id, categoryId, isPrimary: true },
      update: { isPrimary: true },
    });
    for (const slug of fixture.secondaryCategorySlugs ?? []) {
      const id = taxonomy.categories[slug];
      if (!id) continue;
      await prisma.sellerCategory.upsert({
        where: { sellerId_categoryId: { sellerId: seller.id, categoryId: id } },
        create: { sellerId: seller.id, categoryId: id, isPrimary: false },
        update: {},
      });
    }

    const template = templates[fixture.templateKey] ?? templates.classic!;
    await prisma.sellerWebsite.upsert({
      where: { sellerId: seller.id },
      create: {
        sellerId: seller.id,
        templateId: template.id,
        themeTokens: template.defaultTokens,
        // Never let search engines index a fictional business.
        indexable: false,
        indexBlockReason: "Showcase seller",
        publishedAt: now,
      },
      update: {
        templateId: template.id,
        themeTokens: template.defaultTokens,
        indexable: false,
        indexBlockReason: "Showcase seller",
      },
    });

    // Gold, so the subdomain site and the lead inbox are both live (D32).
    const existing = await prisma.subscription.findFirst({
      where: { sellerId: seller.id },
      select: { id: true },
    });
    if (existing) {
      await prisma.subscription.update({
        where: { id: existing.id },
        data: { planId: gold.id, status: "ACTIVE" },
      });
    } else {
      await prisma.subscription.create({
        data: {
          sellerId: seller.id,
          planId: gold.id,
          status: "ACTIVE",
          currentPeriodStart: now,
          currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 3600 * 1000),
        },
      });
    }
    await prisma.seller.update({
      where: { id: seller.id },
      data: { webPresence: goldPlan.webPresence },
    });

    const amount = goldPlan.leadCreditsPerMonth ?? 0;
    const granted = await prisma.creditLedger.findFirst({
      where: { sellerId: seller.id, reason: "MONTHLY_GRANT", periodKey },
      select: { id: true },
    });
    if (amount > 0 && !granted) {
      await prisma.$transaction(async (tx) => {
        const updated = await tx.seller.update({
          where: { id: seller.id },
          data: { creditBalance: { increment: amount } },
          select: { creditBalance: true },
        });
        await tx.creditLedger.create({
          data: {
            sellerId: seller.id,
            delta: amount,
            balanceAfter: updated.creditBalance,
            reason: "MONTHLY_GRANT",
            periodKey,
            note: `Monthly credits for ${periodKey}`,
          },
        });
      });
    }

    await seedSellerCatalog(prisma, taxonomy, seller.id, {
      sellerSlug: fixture.slug,
      products: fixture.products,
      services: fixture.services,
      galleryCount: fixture.galleryCount,
    });
  }

  console.log("→ open buyer requirements");
  const buyer = await prisma.buyer.upsert({
    where: { phone: DEMO_BUYER_PHONE },
    create: {
      phone: DEMO_BUYER_PHONE,
      phoneVerifiedAt: now,
      name: "Demo Buyer",
      company: "Demo Procurement Pvt Ltd",
      locationId: taxonomy.locations["mumbai"],
    },
    update: {},
    select: { id: true },
  });
  const openCount = await prisma.requirement.count({ where: { buyerId: buyer.id } });
  if (openCount === 0) {
    for (const req of REQUIREMENTS) {
      const categoryId = taxonomy.categories[req.categorySlug];
      const locationId = taxonomy.locations[req.city];
      if (!categoryId || !locationId) continue;
      await prisma.requirement.create({
        data: {
          buyerId: buyer.id,
          categoryId,
          locationId,
          productName: req.productName,
          quantity: req.quantity,
          quantityUnit: req.quantityUnit,
          timeline: req.timeline,
          purpose: req.purpose,
          notes: req.notes,
          fingerprint: fingerprint(req.productName, categoryId),
          // PENDING: the lead worker matches sellers and creates the leads.
          fanoutStatus: "PENDING",
        },
      });
    }
    console.log(`   ${REQUIREMENTS.length} requirements queued for the lead worker`);
  } else {
    console.log(`   ${openCount} already present — skipped`);
  }

  await prisma.$executeRawUnsafe(`SELECT create_analytics_partition(CURRENT_DATE)`);

  if (credentials.length > 0) {
    const body =
      `# Bzaro showcase seller logins — generated ${now.toISOString()}\n` +
      `# Sign in at /login. Remove all showcase data with: npm run db:seed:showcase -- --remove\n\n` +
      credentials.join("\n") +
      "\n";
    writeFileSync(CREDENTIALS_FILE, body, { mode: 0o600 });
    console.log(`\n   ${credentials.length} new logins written to ${CREDENTIALS_FILE}`);
  }

  console.log("\n✓ showcase seed complete");
  for (const fixture of SHOWCASE) console.log(`   ${fixture.slug}`);
}

(REMOVE ? remove() : create())
  .catch((error) => {
    console.error("\n✗ showcase seed failed\n", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
