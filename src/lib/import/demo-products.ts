import type { ImportColumnKey } from "@/lib/import/columns";

/**
 * The ten rows in the demo workbook (D49).
 *
 * ── Why these ten ───────────────────────────────────────────────────────────
 * They are a worked example of every rule the format has, not a list of
 * plausible products. Between them they show: a full row with everything
 * filled; a row with no Max Price; a row with no price at all ("Ask for
 * Price", which is the common case in this market); a row with no Brand; a
 * multi-line Full Description; a decimal price (4.5); and two products sharing
 * one sub-category, so a seller can see that repeating a category is normal.
 *
 * ── They must stay importable ───────────────────────────────────────────────
 * `tests/unit/product-import.test.ts` imports this workbook and asserts zero
 * errors. A row here with a category that no longer exists, or a SKU with an
 * underscore in it, therefore fails the suite rather than shipping a demo file
 * that the real importer rejects — which would be the single most confusing
 * thing this feature could do to a new seller.
 *
 * Sub-categories are matched by LEAF NAME against the live taxonomy, so these
 * strings must name real active leaves. The template writer resolves them when
 * it builds the file and the sheet is generated from the database, so a renamed
 * category shows up as a failing test, not as a broken download.
 */

export type DemoRow = Partial<Record<ImportColumnKey, string | number>>;

export const DEMO_PRODUCTS: readonly DemoRow[] = [
  {
    name: "9W LED Bulb Cool White",
    sku: "LED-9W-CW",
    mainCategory: "Electronics & Electrical",
    subCategory: "LED Bulbs",
    price: 55,
    priceMax: 70,
    unit: "Piece",
    minOrderQty: 100,
    brand: "BrightLite",
    modelNumber: "BL-9CW",
    shortDescription: "Energy-saving 9W LED bulb, B22 base, 900 lumens.",
    description:
      "Bright cool-white LED bulb for homes, shops and offices.\n" +
      "Saves up to 85% electricity compared to incandescent bulbs.",
    specifications:
      "Wattage: 9W | Base: B22 | Colour: Cool White | Lumens: 900 | Warranty: 1 Year",
    tags: "led bulb, 9w bulb, cool white bulb",
  },
  {
    name: "12W LED Bulb Warm White",
    sku: "LED-12W-WW",
    mainCategory: "Electronics & Electrical",
    subCategory: "LED Bulbs",
    price: 78,
    unit: "Piece",
    minOrderQty: 100,
    brand: "BrightLite",
    modelNumber: "BL-12WW",
    shortDescription: "12W warm-white LED bulb with surge protection.",
    specifications: "Wattage: 12W | Base: B22 | Colour: Warm White | Warranty: 2 Years",
    tags: "led bulb, 12w bulb, warm white",
  },
  {
    name: "2x2 Ft LED Panel Light 36W",
    sku: "PNL-36W-22",
    mainCategory: "Electronics & Electrical",
    subCategory: "LED Panels",
    price: 650,
    priceMax: 780,
    unit: "Piece",
    minOrderQty: 20,
    brand: "BrightLite",
    modelNumber: "BP-3622",
    shortDescription: "Recessed 600x600 mm LED panel for false ceilings.",
    specifications: "Wattage: 36W | Size: 600 x 600 mm | Body: Aluminium | Warranty: 2 Years",
    tags: "led panel, 2x2 panel, ceiling light",
  },
  {
    name: "1.5 Sq mm FR House Wire (90 m)",
    sku: "WIRE-1-5-FR",
    mainCategory: "Electronics & Electrical",
    subCategory: "House Wires",
    price: 1250,
    unit: "Coil",
    minOrderQty: 10,
    brand: "SafeWire",
    shortDescription: "Flame-retardant PVC insulated copper house wire, 90 m coil.",
    specifications: "Size: 1.5 sq mm | Length: 90 m | Conductor: Copper | Insulation: FR PVC",
    tags: "house wire, 1.5 sqmm wire, copper wire",
  },
  {
    name: "TMT Bar Fe 500D 12 mm",
    sku: "TMT-12-500D",
    mainCategory: "Building & Construction",
    subCategory: "TMT Bars",
    price: 58,
    priceMax: 62,
    unit: "Kg",
    minOrderQty: 1000,
    brand: "Sharma Steel",
    shortDescription: "High-strength Fe 500D TMT reinforcement bar, 12 mm.",
    description:
      "Earthquake-resistant TMT bars for residential and commercial construction.\n" +
      "Rate depends on quantity and delivery location.",
    specifications: "Grade: Fe 500D | Diameter: 12 mm | Length: 12 m | Standard: IS 1786",
    tags: "tmt bar, 12mm saria, fe500d",
  },
  {
    name: "MS Square Pipe 40x40 mm",
    sku: "MSP-40X40",
    mainCategory: "Building & Construction",
    subCategory: "Steel Pipes & Tubes",
    price: 64,
    unit: "Kg",
    minOrderQty: 500,
    brand: "Sharma Steel",
    shortDescription: "Mild steel square hollow section for fabrication work.",
    specifications: "Size: 40 x 40 mm | Thickness: 2 mm | Length: 6 m | Material: Mild Steel",
    tags: "ms pipe, square pipe, hollow section",
  },
  {
    name: "20 Litre HDPE Plastic Bucket",
    sku: "BKT-20L-HD",
    mainCategory: "Plastics, Polymers & Resins",
    subCategory: "Plastic Containers & Crates",
    price: 95,
    priceMax: 120,
    unit: "Piece",
    minOrderQty: 200,
    brand: "Verma Plastics",
    shortDescription: "Heavy-duty HDPE bucket with lid and steel handle.",
    specifications: "Capacity: 20 L | Material: HDPE | Colour: White, Blue | Lid: Yes",
    tags: "plastic bucket, 20 litre bucket, hdpe bucket",
  },
  {
    // No price: "Ask for Price" is the default in this market, not an edge case.
    name: "Plastic Storage Crate 50 L",
    sku: "CRT-50L",
    mainCategory: "Plastics, Polymers & Resins",
    subCategory: "Plastic Containers & Crates",
    unit: "Piece",
    minOrderQty: 50,
    brand: "Verma Plastics",
    shortDescription: "Stackable crate for vegetables, dairy and warehouse use.",
    specifications: "Capacity: 50 L | Size: 600 x 400 x 300 mm | Material: PP",
    tags: "plastic crate, storage crate, vegetable crate",
  },
  {
    name: "Printed Standup Pouch with Zip",
    sku: "PCH-SUP-250G",
    mainCategory: "Packaging Materials & Supplies",
    subCategory: "Packaging Bags & Pouches",
    // A decimal price, so a seller selling at ₹4.50 can see it is allowed.
    price: 4.5,
    priceMax: 7,
    unit: "Piece",
    minOrderQty: 5000,
    shortDescription: "Custom-printed laminated pouch for 250 g food packs.",
    description:
      "Food-grade laminated standup pouch with zip lock and tear notch.\n" +
      "Custom printing up to 8 colours. Price depends on design and quantity.",
    specifications: "Capacity: 250 g | Material: PET + PE | Printing: Up to 8 colours | Zip: Yes",
    tags: "standup pouch, zipper pouch, food packaging",
  },
  {
    name: "5-Ply Corrugated Box 18x12x12 inch",
    sku: "CBX-5P-181212",
    mainCategory: "Packaging Materials & Supplies",
    subCategory: "Corrugated Boxes & Cartons",
    price: 38,
    unit: "Piece",
    minOrderQty: 500,
    shortDescription: "Heavy-duty 5-ply shipping box for e-commerce and moving.",
    specifications: "Size: 18 x 12 x 12 inch | Ply: 5 | Burst Factor: 18 BF",
    tags: "corrugated box, 5 ply box, shipping box",
  },
] as const;
