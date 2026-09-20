import {
  ABC_PRODUCTS,
  ABC_SERVICES,
  VERMA_PRODUCTS,
  VERMA_SERVICES,
  type ProductFixture,
  type ServiceFixture,
} from "../catalog";

/**
 * Showcase seller fixtures (data only). Consumed by prisma/seed/showcase.ts
 * and by scripts/demo-images.ts, which fetches a real photo for every item.
 */

export type Showcase = {
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

export const SHOWCASE: Showcase[] = [
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
export const REQUIREMENTS = [
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
