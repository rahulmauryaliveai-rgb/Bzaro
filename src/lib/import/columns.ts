/**
 * The Products sheet, defined once (D49).
 *
 * Both halves of bulk upload read this list: the template writer builds the
 * header row, the widths, the cell styles, the header notes and the dropdowns
 * from it, and the parser matches a seller's uploaded headers against it. They
 * cannot drift, which is the whole point — a template whose column order no
 * longer matches the parser is a feature that appears to work and silently
 * writes prices into the Unit column.
 *
 * ── Why the header text carries " *" ────────────────────────────────────────
 * Sellers recognise the convention, and the parser strips it when matching
 * (`normaliseHeader`), so "Price (₹)" and "price" and "Price (₹) *" all land on
 * the same column. That tolerance is deliberate: the one thing a seller will
 * reliably do to a spreadsheet is retype a header.
 *
 * ── The language ────────────────────────────────────────────────────────────
 * Notes and validation messages are Hinglish, matching the workbook this
 * reproduces. The audience is a small trader in an Indian market town reading
 * on a phone, and "Sirf number likhein" lands where "Enter a numeric value"
 * does not.
 */

/** Every field the sheet can carry. Order IS the column order. */
export type ImportColumnKey =
  | "name"
  | "sku"
  | "mainCategory"
  | "subCategory"
  | "price"
  | "priceMax"
  | "unit"
  | "minOrderQty"
  | "brand"
  | "modelNumber"
  | "shortDescription"
  | "description"
  | "specifications"
  | "tags";

export type ImportColumn = {
  key: ImportColumnKey;
  /** Exactly as written in row 1 of the generated workbook. */
  header: string;
  /** Required columns get the darker header fill and a "*" in the label. */
  required: boolean;
  /** Excel column width. */
  width: number;
  /** The comment attached to the header cell. */
  note: string;
  /**
   * Which cell style the data rows get. `text` forces Excel to keep a SKU like
   * `0012` as typed instead of turning it into the number 12.
   */
  format: "general" | "text" | "decimal" | "integer" | "wrap";
};

export const IMPORT_COLUMNS: readonly ImportColumn[] = [
  {
    key: "name",
    header: "Product Name *",
    required: true,
    width: 34,
    format: "general",
    note:
      "Product ka naam jaisa buyer search karega. 2–200 letters.\n" +
      "Example: 9W LED Bulb Cool White",
  },
  {
    key: "sku",
    header: "SKU / Product Code *",
    required: true,
    width: 24,
    format: "text",
    note:
      "Har product ka apna unique code. Isi naam se photo upload hogi.\n" +
      "Only A–Z, 0–9 and hyphen (-). No space, no underscore (_), no slash.\n" +
      "Example: LED-9W-CW",
  },
  {
    key: "mainCategory",
    header: "Main Category *",
    required: true,
    width: 28,
    format: "general",
    note: "Dropdown se choose karein.",
  },
  {
    key: "subCategory",
    header: "Sub Category *",
    required: true,
    width: 30,
    format: "general",
    note:
      "Pehle Main Category choose karein, phir yahan dropdown se Sub Category.\n" +
      "Full list: 'Categories' sheet.",
  },
  {
    key: "price",
    header: "Price (₹)",
    required: false,
    width: 12,
    format: "decimal",
    note:
      "Sirf number, bina ₹ ya comma. Example: 85\n" +
      "Khali chhodenge to product par 'Ask for Price' dikhega.",
  },
  {
    key: "priceMax",
    header: "Max Price (₹)",
    required: false,
    width: 13,
    format: "decimal",
    note: "Optional. Price range ke liye (e.g. 85 to 110). Price se kam nahi ho sakta.",
  },
  {
    key: "unit",
    header: "Unit",
    required: false,
    width: 12,
    format: "general",
    note: "Price kis unit par hai: Piece, Kg, Meter, Box… Dropdown se choose karein ya type karein.",
  },
  {
    key: "minOrderQty",
    header: "Min Order Qty",
    required: false,
    width: 13,
    format: "integer",
    note: "Minimum order quantity — whole number. Example: 100",
  },
  {
    key: "brand",
    header: "Brand",
    required: false,
    width: 16,
    format: "general",
    note: "Optional. Max 100 letters.",
  },
  {
    key: "modelNumber",
    header: "Model Number",
    required: false,
    width: 16,
    format: "text",
    note: "Optional. Max 60 letters.",
  },
  {
    key: "shortDescription",
    header: "Short Description",
    required: false,
    width: 40,
    format: "wrap",
    note: "1–2 lines jo product card par dikhengi. Max 300 letters.",
  },
  {
    key: "description",
    header: "Full Description",
    required: false,
    width: 50,
    format: "wrap",
    note:
      "Product page ka detail description. Max 5000 letters.\n" +
      "New line ke liye Alt+Enter dabayein.",
  },
  {
    key: "specifications",
    header: "Specifications",
    required: false,
    width: 44,
    format: "wrap",
    note:
      "Format: Key: Value | Key: Value\n" +
      "Example: Wattage: 9W | Colour: Cool White | Warranty: 1 Year\n" +
      "Max 30 specifications.",
  },
  {
    key: "tags",
    header: "Search Tags",
    required: false,
    width: 30,
    format: "general",
    note: "Comma se alag karein. Max 20 tags.\nExample: led bulb, 9w bulb, cool white",
  },
] as const;

/** Sheet names. "Do not rename sheets" is a rule the parser enforces. */
export const SHEET_NAMES = {
  howTo: "How to Upload",
  products: "Products",
  categories: "Categories",
  /** Hidden: it holds the dropdown sources, not anything a seller edits. */
  lists: "Lists",
} as const;

/** Stamped on the How to Upload sheet so a stale file can be recognised. */
export const TEMPLATE_VERSION = "BZARO-PRODUCTS-v1";

/** Row 1 is the header, data starts at row 2, and the sheet stops at 1001. */
export const HEADER_ROW = 1;
export const FIRST_DATA_ROW = 2;
export const MAX_IMPORT_ROWS = 1000;
export const LAST_DATA_ROW = FIRST_DATA_ROW + MAX_IMPORT_ROWS - 1;

/**
 * Units offered in the dropdown.
 *
 * A warning-level list, not a restriction: a seller selling by "Truckload"
 * should be able to type it. Offering the common twenty-five stops the same
 * concept arriving as "pcs", "Pcs", "piece" and "Nos" across one catalogue.
 */
export const UNIT_OPTIONS = [
  "Piece",
  "Pack",
  "Box",
  "Set",
  "Pair",
  "Dozen",
  "Kg",
  "Gram",
  "Tonne",
  "Quintal",
  "Litre",
  "Ml",
  "Meter",
  "Feet",
  "Sq Ft",
  "Sq Meter",
  "Roll",
  "Coil",
  "Bundle",
  "Bag",
  "Carton",
  "Sheet",
  "Unit",
  "Kit",
  "Nos",
] as const;

/**
 * Reduce a header cell to something comparable.
 *
 * Trimmed, lower-cased, "*" dropped, and runs of whitespace collapsed — Excel
 * keeps the non-breaking spaces and double spaces that copy-paste introduces,
 * and a column that fails to match because of an invisible character is the
 * least debuggable failure this feature could have.
 */
export function normaliseHeader(value: string): string {
  return value
    .replace(/ /g, " ")
    .replace(/\*/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * Header text → column key.
 *
 * Carries the generated header plus the spellings sellers actually produce
 * when they retype a column by hand. Everything goes through
 * `normaliseHeader`, so case, "*" and stray spacing are already handled and
 * only genuinely different WORDS need listing.
 */
const HEADER_ALIASES: Record<string, ImportColumnKey> = {
  "product name": "name",
  name: "name",
  product: "name",
  "sku / product code": "sku",
  sku: "sku",
  "product code": "sku",
  code: "sku",
  "main category": "mainCategory",
  category: "mainCategory",
  "sub category": "subCategory",
  subcategory: "subCategory",
  "price (₹)": "price",
  "price (rs)": "price",
  "price (inr)": "price",
  price: "price",
  "max price (₹)": "priceMax",
  "max price (rs)": "priceMax",
  "max price": "priceMax",
  unit: "unit",
  "min order qty": "minOrderQty",
  "minimum order quantity": "minOrderQty",
  moq: "minOrderQty",
  brand: "brand",
  "model number": "modelNumber",
  model: "modelNumber",
  "short description": "shortDescription",
  "full description": "description",
  description: "description",
  specifications: "specifications",
  specification: "specifications",
  specs: "specifications",
  "search tags": "tags",
  tags: "tags",
  keywords: "tags",
};

export function columnKeyForHeader(header: string): ImportColumnKey | null {
  return HEADER_ALIASES[normaliseHeader(header)] ?? null;
}

export const REQUIRED_COLUMN_KEYS: readonly ImportColumnKey[] = IMPORT_COLUMNS.filter(
  (column) => column.required,
).map((column) => column.key);

/** The header as written in the template, for an error message naming it. */
export function headerFor(key: ImportColumnKey): string {
  return IMPORT_COLUMNS.find((column) => column.key === key)?.header ?? key;
}
