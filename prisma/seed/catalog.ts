import type { PrismaClient } from "../../src/generated/prisma/client";
import type { SeededTaxonomy } from "./taxonomy";

/**
 * Catalogue fixtures: products, services and gallery images.
 *
 * Without these the microsite renders a shell — so these exist to make the
 * seller website testable and reviewable, not just to fill space. The data is
 * deliberately UNEVEN, because real seller catalogues are:
 *
 *   - some products priced, some "price on request" (the norm in Indian B2B)
 *   - some with specifications, some with nothing but a name
 *   - some with several images, some with none
 *   - one seller rich, one deliberately sparse (the D2 gate fixture)
 *
 * A seed where every row is fully populated hides exactly the layout bugs that
 * real data produces on day one.
 *
 * Images point at picsum.photos with deterministic seeds. They require network
 * access to display; offline they render as broken images, which is acceptable
 * for a development fixture and avoids committing binaries.
 */

function image(seed: string, w = 800, h = 600): string {
  return `https://picsum.photos/seed/${seed}/${w}/${h}`;
}

type ProductFixture = {
  slug: string;
  name: string;
  shortDescription: string;
  description?: string;
  brand?: string;
  sku?: string;
  categorySlug: string;
  priceMinor?: number;
  priceMaxMinor?: number;
  unit?: string;
  minOrderQty?: number;
  specifications?: Array<{ key: string; value: string }>;
  tags?: string[];
  images?: number;
  featured?: boolean;
};

const ABC_PRODUCTS: ProductFixture[] = [
  {
    slug: "led-panel-40w",
    name: "LED Panel Light 40W",
    shortDescription: "Recessed ceiling panel, 4000K neutral white, 3600 lumens.",
    description:
      "A 40W recessed LED panel for offices, retail and institutional ceilings. " +
      "The diffuser is edge-lit for even illumination with no visible hotspots, and the " +
      "driver is housed externally for serviceability without removing the fixture.\n\n" +
      "Manufactured at our Mumbai facility and tested to IS 16101. Supplied with a " +
      "two-year replacement warranty covering both the panel and the driver.",
    brand: "ABC Lighting",
    sku: "ABC-LP-40W",
    categorySlug: "led-panels",
    priceMinor: 129_000,
    unit: "piece",
    minOrderQty: 10,
    specifications: [
      { key: "Wattage", value: "40 W" },
      { key: "Luminous flux", value: "3600 lm" },
      { key: "Colour temperature", value: "4000 K" },
      { key: "Input voltage", value: "140–280 V AC" },
      { key: "Dimensions", value: "595 × 595 × 12 mm" },
      { key: "Warranty", value: "2 years" },
    ],
    tags: ["led", "panel", "office lighting", "recessed"],
    images: 3,
    featured: true,
  },
  {
    slug: "led-bulb-9w-b22",
    name: "LED Bulb 9W B22",
    shortDescription: "Standard bayonet cap bulb, 6500K cool daylight.",
    description:
      "A 9W bayonet-cap LED bulb for general residential and commercial use, rated " +
      "for 25,000 hours. Supplied in cartons of 100 for distributors.",
    brand: "ABC Lighting",
    sku: "ABC-B-9W-B22",
    categorySlug: "led-bulbs",
    priceMinor: 9_900,
    unit: "piece",
    minOrderQty: 100,
    specifications: [
      { key: "Wattage", value: "9 W" },
      { key: "Base", value: "B22" },
      { key: "Colour temperature", value: "6500 K" },
      { key: "Rated life", value: "25,000 hours" },
    ],
    tags: ["led", "bulb", "b22"],
    images: 2,
    featured: true,
  },
  {
    slug: "street-light-120w",
    name: "LED Street Light 120W",
    shortDescription: "IP66 die-cast housing for municipal and highway installation.",
    description:
      "A 120W street luminaire with a die-cast aluminium housing and toughened glass " +
      "cover, rated IP66 for continuous outdoor exposure. Supplied with a surge " +
      "protection device rated to 10kV as standard, which is what determines survival " +
      "during monsoon-season switching transients.",
    brand: "ABC Lighting",
    sku: "ABC-SL-120W",
    categorySlug: "street-lights",
    priceMinor: 845_000,
    unit: "piece",
    specifications: [
      { key: "Wattage", value: "120 W" },
      { key: "Ingress protection", value: "IP66" },
      { key: "Surge protection", value: "10 kV" },
      { key: "Mounting", value: "60 mm pole bracket" },
    ],
    tags: ["street light", "outdoor", "municipal"],
    images: 2,
  },
  {
    slug: "high-bay-150w",
    name: "LED High Bay 150W",
    shortDescription: "Industrial high bay for warehouses and manufacturing floors.",
    brand: "ABC Lighting",
    sku: "ABC-HB-150W",
    categorySlug: "led-panels",
    priceMinor: 612_000,
    unit: "piece",
    specifications: [
      { key: "Wattage", value: "150 W" },
      { key: "Beam angle", value: "120°" },
      { key: "Mounting height", value: "6–12 m" },
    ],
    tags: ["high bay", "industrial", "warehouse"],
    images: 1,
  },
  {
    slug: "copper-cable-2-5mm",
    name: "Copper Flexible Cable 2.5 sq mm",
    shortDescription: "FR-grade PVC insulated copper conductor, 90m coil.",
    // No price: the single most common state in a real B2B catalogue, because
    // copper is commodity-priced and quoted per enquiry.
    categorySlug: "copper-cables",
    unit: "coil",
    minOrderQty: 5,
    specifications: [
      { key: "Cross-section", value: "2.5 sq mm" },
      { key: "Conductor", value: "99.97% bare copper" },
      { key: "Insulation", value: "FR PVC" },
      { key: "Coil length", value: "90 m" },
    ],
    tags: ["cable", "copper", "wiring"],
    images: 1,
  },
  {
    slug: "control-cable-4core",
    name: "Control Cable 4 Core 1.5 sq mm",
    shortDescription: "Screened control cable for instrumentation runs.",
    categorySlug: "control-cables",
    priceMinor: 18_500,
    priceMaxMinor: 24_000,
    unit: "metre",
    minOrderQty: 100,
    tags: ["cable", "control", "instrumentation"],
    images: 1,
  },
  // A deliberately bare entry: name and category only. Proves the card and
  // detail layouts hold up when a seller adds a product and stops.
  {
    slug: "junction-box-6way",
    name: "Junction Box 6 Way",
    shortDescription: "",
    categorySlug: "cables-wires",
  },
];

const VERMA_PRODUCTS: ProductFixture[] = [
  {
    slug: "ldpe-packaging-film",
    name: "LDPE Packaging Film",
    shortDescription: "Food-grade low-density polyethylene film, 40–200 micron.",
    description:
      "Blown LDPE film produced on two extrusion lines, supplied in roll widths from " +
      "150 mm to 1400 mm. Food-grade resin, suitable for primary packaging.",
    categorySlug: "industrial-textiles",
    priceMinor: 14_200,
    unit: "kg",
    minOrderQty: 500,
    specifications: [
      { key: "Thickness", value: "40–200 micron" },
      { key: "Width", value: "150–1400 mm" },
      { key: "Grade", value: "Food grade" },
    ],
    tags: ["packaging", "film", "ldpe"],
    images: 2,
    featured: true,
  },
  {
    slug: "moulded-closures",
    name: "Injection Moulded Closures",
    shortDescription: "Tamper-evident closures for pharmaceutical containers.",
    categorySlug: "industrial-textiles",
    unit: "piece",
    minOrderQty: 10_000,
    tags: ["moulding", "pharma", "closures"],
    images: 1,
  },
  {
    slug: "shrink-sleeve",
    name: "PVC Shrink Sleeve",
    shortDescription: "Printed shrink sleeves for bottle labelling.",
    categorySlug: "industrial-textiles",
    priceMinor: 6_800,
    unit: "kg",
    tags: ["shrink", "labelling"],
    images: 1,
  },
];

type ServiceFixture = {
  slug: string;
  name: string;
  shortDescription: string;
  description?: string;
  categorySlug: string;
  priceMinor?: number;
  pricingModel?: string;
  serviceAreas?: string[];
  deliverables?: string[];
  featured?: boolean;
};

const ABC_SERVICES: ServiceFixture[] = [
  {
    slug: "lighting-design-consultation",
    name: "Lighting Design & Consultation",
    shortDescription: "Photometric layout and fixture selection for commercial projects.",
    description:
      "We produce a photometric layout for your space using DIALux, specify fixture " +
      "types and quantities, and provide a bill of materials you can tender against.\n\n" +
      "Typical turnaround is five working days for a floor plate up to 2,000 sq m.",
    categorySlug: "led-panels",
    priceMinor: 1_500_000,
    pricingModel: "fixed",
    serviceAreas: ["Mumbai", "Pune", "Nashik", "Thane"],
    deliverables: [
      "DIALux photometric simulation",
      "Fixture schedule and bill of materials",
      "Lux-level compliance report",
      "One revision round",
    ],
    featured: true,
  },
  {
    slug: "installation-commissioning",
    name: "Installation & Commissioning",
    shortDescription: "Site installation by our own crews, with handover testing.",
    description:
      "Installation carried out by in-house crews rather than subcontractors, " +
      "including cable runs, mounting, and commissioning tests with a signed " +
      "handover report.",
    categorySlug: "led-panels",
    pricingModel: "quote",
    serviceAreas: ["Mumbai", "Navi Mumbai", "Thane"],
    deliverables: ["Site survey", "Installation", "Commissioning report", "Warranty activation"],
  },
  {
    slug: "amc-maintenance",
    name: "Annual Maintenance Contract",
    shortDescription: "Scheduled maintenance and priority replacement.",
    categorySlug: "led-panels",
    priceMinor: 250_000,
    pricingModel: "monthly",
    serviceAreas: ["Mumbai", "Pune"],
    deliverables: ["Quarterly inspection", "Priority replacement", "Annual lux audit"],
  },
];

const VERMA_SERVICES: ServiceFixture[] = [
  {
    slug: "custom-extrusion",
    name: "Custom Film Extrusion",
    shortDescription: "Bespoke film gauges and widths to your specification.",
    categorySlug: "industrial-textiles",
    pricingModel: "quote",
    serviceAreas: ["Ahmedabad", "Surat", "Vadodara"],
    deliverables: ["Sample run", "Gauge verification", "Production scheduling"],
    featured: true,
  },
  {
    slug: "contract-packaging",
    name: "Contract Packaging",
    shortDescription: "Pack-out services for chemical and pharmaceutical clients.",
    categorySlug: "industrial-textiles",
    pricingModel: "quote",
    serviceAreas: ["Gujarat"],
  },
];

export async function seedCatalog(prisma: PrismaClient, taxonomy: SeededTaxonomy) {
  const sellers = await prisma.seller.findMany({
    where: { slug: { in: ["abc-electronics", "verma-plastics", "sharma-steel"] } },
    select: { id: true, slug: true },
  });

  const bySlug = new Map(sellers.map((s) => [s.slug, s.id]));

  const plan: Array<{
    sellerSlug: string;
    products: ProductFixture[];
    services: ServiceFixture[];
    galleryCount: number;
  }> = [
    {
      sellerSlug: "abc-electronics",
      products: ABC_PRODUCTS,
      services: ABC_SERVICES,
      galleryCount: 8,
    },
    {
      sellerSlug: "verma-plastics",
      products: VERMA_PRODUCTS,
      services: VERMA_SERVICES,
      galleryCount: 5,
    },
    // sharma-steel gets exactly one product and no services, keeping it below
    // the D2 catalogue threshold. It is the fixture that proves the gate works.
    {
      sellerSlug: "sharma-steel",
      products: [
        {
          slug: "tmt-bar-12mm",
          name: "TMT Bar 12mm Fe500D",
          shortDescription: "Thermo-mechanically treated reinforcement bar.",
          categorySlug: "tmt-bars",
          unit: "tonne",
        },
      ],
      services: [],
      galleryCount: 0,
    },
  ];

  for (const entry of plan) {
    const sellerId = bySlug.get(entry.sellerSlug);
    if (!sellerId) continue;

    // Products
    for (const [index, fixture] of entry.products.entries()) {
      const categoryId = taxonomy.categories[fixture.categorySlug];

      const product = await prisma.product.upsert({
        where: { sellerId_slug: { sellerId, slug: fixture.slug } },
        create: {
          sellerId,
          categoryId,
          slug: fixture.slug,
          name: fixture.name,
          shortDescription: fixture.shortDescription || null,
          description: fixture.description ?? null,
          brand: fixture.brand ?? null,
          sku: fixture.sku ?? null,
          priceMinor: fixture.priceMinor ?? null,
          priceMaxMinor: fixture.priceMaxMinor ?? null,
          currency: "INR",
          unit: fixture.unit ?? null,
          minOrderQty: fixture.minOrderQty ?? null,
          priceOnRequest: fixture.priceMinor === undefined,
          specifications: fixture.specifications ?? undefined,
          tags: fixture.tags ?? [],
          status: "PUBLISHED",
          moderationStatus: "APPROVED",
          isFeatured: fixture.featured ?? false,
        },
        update: {
          name: fixture.name,
          status: "PUBLISHED",
          moderationStatus: "APPROVED",
        },
        select: { id: true },
      });

      const imageCount = fixture.images ?? 0;
      const existingImages = await prisma.productImage.count({
        where: { productId: product.id },
      });

      if (existingImages === 0 && imageCount > 0) {
        await prisma.productImage.createMany({
          data: Array.from({ length: imageCount }, (_, i) => ({
            productId: product.id,
            sellerId,
            provider: "CLOUDINARY" as const,
            publicId: `seed/${entry.sellerSlug}/${fixture.slug}-${i}`,
            url: image(`${fixture.slug}-${i}`),
            width: 800,
            height: 600,
            alt: `${fixture.name} — view ${i + 1}`,
            sortOrder: i,
            moderationStatus: "APPROVED" as const,
          })),
        });
      }

      void index;
    }

    // Services
    for (const fixture of entry.services) {
      const categoryId = taxonomy.categories[fixture.categorySlug];

      await prisma.service.upsert({
        where: { sellerId_slug: { sellerId, slug: fixture.slug } },
        create: {
          sellerId,
          categoryId,
          slug: fixture.slug,
          name: fixture.name,
          shortDescription: fixture.shortDescription,
          description: fixture.description ?? null,
          priceMinor: fixture.priceMinor ?? null,
          currency: "INR",
          pricingModel: fixture.pricingModel ?? null,
          priceOnRequest: fixture.priceMinor === undefined,
          serviceAreas: fixture.serviceAreas ?? [],
          deliverables: fixture.deliverables ?? undefined,
          status: "PUBLISHED",
          moderationStatus: "APPROVED",
          isFeatured: fixture.featured ?? false,
        },
        update: {
          name: fixture.name,
          status: "PUBLISHED",
          moderationStatus: "APPROVED",
        },
      });
    }

    // Gallery
    const existingGallery = await prisma.galleryItem.count({ where: { sellerId } });
    if (existingGallery === 0 && entry.galleryCount > 0) {
      await prisma.galleryItem.createMany({
        data: Array.from({ length: entry.galleryCount }, (_, i) => ({
          sellerId,
          provider: "CLOUDINARY" as const,
          publicId: `seed/${entry.sellerSlug}/gallery-${i}`,
          url: image(`${entry.sellerSlug}-gallery-${i}`, 600, 600),
          width: 600,
          height: 600,
          alt: `${entry.sellerSlug} facility photo ${i + 1}`,
          caption: i === 0 ? "Production floor" : null,
          sortOrder: i,
          moderationStatus: "APPROVED" as const,
        })),
      });
    }

    // Reconcile the denormalised counters against what was actually written.
    // The seed is a write path like any other, and a counter that disagrees
    // with reality here would show up as a wrong navigation item.
    const [productCount, serviceCount] = await Promise.all([
      prisma.product.count({
        where: { sellerId, status: "PUBLISHED", deletedAt: null, moderationStatus: "APPROVED" },
      }),
      prisma.service.count({
        where: { sellerId, status: "PUBLISHED", deletedAt: null, moderationStatus: "APPROVED" },
      }),
    ]);

    await prisma.seller.update({
      where: { id: sellerId },
      data: { productCount, serviceCount },
    });

    console.log(
      `   ${entry.sellerSlug.padEnd(18)} ${productCount} products, ${serviceCount} services, ${entry.galleryCount} gallery`,
    );
  }
}
