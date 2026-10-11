import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  formatIssue,
  parseProductGrid,
  readPrice,
  readSpecifications,
  readWholeNumber,
  type CategoryLookup,
  type ParseResult,
} from "@/lib/import/parse";
import { readProductRows } from "@/lib/import/read-workbook";
import { buildTemplateWorkbook, type TemplateCategory } from "@/lib/import/template";
import { DEMO_PRODUCTS } from "@/lib/import/demo-products";
import { IMPORT_COLUMNS, MAX_IMPORT_ROWS } from "@/lib/import/columns";

/**
 * The spreadsheet importer (D49).
 *
 * ── Why the demo workbook is the central case ──────────────────────────────
 * Bulk upload has one failure mode worse than refusing a good file: shipping a
 * demo file that the importer itself rejects. A seller downloads the example,
 * uploads it unchanged to see what happens, and is told it is wrong. There is
 * no recovering the seller's confidence in the feature after that.
 *
 * So the first test here generates the real demo workbook through the real
 * writer, reads it back through the real reader, and asserts zero errors. It
 * fails if a demo row names a category that no longer exists, if a column is
 * renamed on one side only, or if the writer and parser disagree about
 * anything at all.
 *
 * Everything else is the cases a seller actually produces: a price with a
 * rupee sign, a category typed from memory, the same code on two rows, a
 * column deleted, and a file past the row cap.
 */

// ── Fixtures ────────────────────────────────────────────────────────────────

/**
 * A small taxonomy covering every category shape the parser has to handle:
 * leaves at two depths, two branches sharing the leaf name "Fittings", and
 * slugs that differ from names.
 */
const CATEGORIES: TemplateCategory[] = [
  { id: "cledbulbs0000000000000001", main: "Electronics & Electrical", sub: "LED Bulbs", fullPath: "Electronics & Electrical > Lighting > LED Bulbs" },
  { id: "cledpanels000000000000002", main: "Electronics & Electrical", sub: "LED Panels", fullPath: "Electronics & Electrical > Lighting > LED Panels" },
  { id: "chousewires00000000000003", main: "Electronics & Electrical", sub: "House Wires", fullPath: "Electronics & Electrical > Cables & Wires > House Wires" },
  { id: "celecfittings000000000004", main: "Electronics & Electrical", sub: "Fittings", fullPath: "Electronics & Electrical > Fittings" },
  { id: "ctmtbars00000000000000005", main: "Building & Construction", sub: "TMT Bars", fullPath: "Building & Construction > Steel > TMT Bars" },
  { id: "csteelpipes00000000000006", main: "Building & Construction", sub: "Steel Pipes & Tubes", fullPath: "Building & Construction > Steel > Steel Pipes & Tubes" },
  { id: "cplumbfittings00000000007", main: "Building & Construction", sub: "Fittings", fullPath: "Building & Construction > Plumbing > Fittings" },
  { id: "ccrates000000000000000008", main: "Plastics, Polymers & Resins", sub: "Plastic Containers & Crates", fullPath: "Plastics, Polymers & Resins > Plastic Containers & Crates" },
  { id: "cpouches00000000000000009", main: "Packaging Materials & Supplies", sub: "Packaging Bags & Pouches", fullPath: "Packaging Materials & Supplies > Packaging Bags & Pouches" },
  { id: "cboxes000000000000000010", main: "Packaging Materials & Supplies", sub: "Corrugated Boxes & Cartons", fullPath: "Packaging Materials & Supplies > Corrugated Boxes & Cartons" },
];

/** Slugs, so the parser's "also accept the slug" path has something to match. */
const SLUGS: Record<string, string> = {
  "cledbulbs0000000000000001": "led-bulbs",
  "cledpanels000000000000002": "led-panels",
  "chousewires00000000000003": "house-wires",
  "ctmtbars00000000000000005": "tmt-bars",
  "csteelpipes00000000000006": "steel-pipes",
  "ccrates000000000000000008": "plastic-containers",
  "cpouches00000000000000009": "packaging-bags",
  "cboxes000000000000000010": "corrugated-boxes",
};

/**
 * Mirrors `buildLookup` in import-template.service, which is the real
 * implementation but needs a database. Kept deliberately small and explicit so
 * a divergence shows up as a failing test rather than as matching behaviour
 * the parser never actually gets.
 */
function lookupFor(categories: TemplateCategory[]): CategoryLookup {
  const byName = new Map<string, string>();
  const pathById = new Map<string, string>();
  const counts = new Map<string, number>();

  for (const category of categories) {
    pathById.set(category.id, category.fullPath);

    const name = category.sub.toLowerCase();
    counts.set(name, (counts.get(name) ?? 0) + 1);

    const keys = [name, SLUGS[category.id] ?? "", `${category.main.toLowerCase()} > ${name}`];
    for (const key of keys) if (key && !byName.has(key)) byName.set(key, category.id);
  }

  return {
    byName,
    pathById,
    ambiguous: new Set([...counts].filter(([, count]) => count > 1).map(([name]) => name)),
  };
}

const LOOKUP = lookupFor(CATEGORIES);

const HEADERS = IMPORT_COLUMNS.map((column) => column.header);

/** A grid from partial rows, so each test writes only the cells it cares about. */
function gridOf(rows: Array<Partial<Record<string, string>>>, headers = HEADERS): string[][] {
  return [
    headers,
    ...rows.map((row) => IMPORT_COLUMNS.map((column) => row[column.key] ?? "")),
  ];
}

/** A minimal valid row, for tests that break exactly one thing. */
function validRow(overrides: Partial<Record<string, string>> = {}) {
  return {
    name: "9W LED Bulb",
    sku: "LED-9W",
    mainCategory: "Electronics & Electrical",
    subCategory: "LED Bulbs",
    price: "55",
    ...overrides,
  };
}

function parse(
  rows: Array<Partial<Record<string, string>>>,
  options: {
    headers?: string[];
    existingSkus?: Map<string, string>;
    remainingProductSlots?: number;
  } = {},
): ParseResult {
  return parseProductGrid({
    grid: gridOf(rows, options.headers),
    categories: LOOKUP,
    existingSkus: options.existingSkus ?? new Map(),
    remainingProductSlots: options.remainingProductSlots ?? 1000,
  });
}

/** Narrowing helper: fails the test rather than returning a union. */
function expectOk(result: ParseResult) {
  if (!result.ok) {
    throw new Error(`expected a parsed file, got problem: ${JSON.stringify(result.problem)}`);
  }
  return result;
}

// ── The demo workbook ───────────────────────────────────────────────────────

describe("the demo workbook", () => {
  it("imports with zero errors, end to end through the real writer and reader", async () => {
    const file = await buildTemplateWorkbook({ categories: CATEGORIES, demo: true });

    const read = await readProductRows(new Uint8Array(file));
    expect(read.ok, "the generated demo must be readable").toBe(true);
    if (!read.ok) return;

    const result = expectOk(
      parseProductGrid({
        grid: read.rows,
        categories: LOOKUP,
        existingSkus: new Map(),
        remainingProductSlots: 1000,
      }),
    );

    const problems = result.rows.flatMap((row) => row.issues.map(formatIssue));
    expect(problems, "the demo file must import cleanly").toEqual([]);

    expect(result.counts.total).toBe(DEMO_PRODUCTS.length);
    expect(result.counts.create).toBe(DEMO_PRODUCTS.length);
    expect(result.counts.error).toBe(0);
  });

  it("carries every demo value through unchanged", async () => {
    const file = await buildTemplateWorkbook({ categories: CATEGORIES, demo: true });
    const read = await readProductRows(new Uint8Array(file));
    if (!read.ok) throw new Error("unreadable");

    const result = expectOk(
      parseProductGrid({
        grid: read.rows,
        categories: LOOKUP,
        existingSkus: new Map(),
        remainingProductSlots: 1000,
      }),
    );

    const bulb = result.rows[0]!;
    expect(bulb.input?.name).toBe("9W LED Bulb Cool White");
    expect(bulb.input?.sku).toBe("LED-9W-CW");
    expect(bulb.input?.categoryId).toBe("cledbulbs0000000000000001");
    expect(bulb.input?.price).toBe("55");
    expect(bulb.input?.priceMax).toBe("70");
    expect(bulb.input?.minOrderQty).toBe("100");
    expect(bulb.input?.priceOnRequest).toBe(false);
    expect(bulb.input?.specifications).toHaveLength(5);
    expect(bulb.input?.specifications[0]).toEqual({ key: "Wattage", value: "9W" });
    expect(bulb.input?.tags).toEqual(["led bulb", "9w bulb", "cool white bulb"]);
    // Never published from a spreadsheet, whatever the file says.
    expect(bulb.input?.status).toBe("DRAFT");

    // The two-line Full Description must survive as two lines.
    expect(bulb.input?.description).toContain("\n");

    // The crate row has no price at all: that is "ask for price", not an error.
    const crate = result.rows.find((row) => row.sku === "CRT-50L")!;
    expect(crate.status).toBe("new");
    expect(crate.input?.price).toBe("");
    expect(crate.input?.priceOnRequest).toBe(true);

    // And a decimal price stays a decimal.
    const pouch = result.rows.find((row) => row.sku === "PCH-SUP-250G")!;
    expect(pouch.input?.price).toBe("4.5");
  });

  it("reads the blank template as a file with no rows", async () => {
    // The template styles all 1000 rows without filling them. If those were
    // read as data, every download would import as 1000 broken products.
    const file = await buildTemplateWorkbook({ categories: CATEGORIES, demo: false });
    const read = await readProductRows(new Uint8Array(file));
    if (!read.ok) throw new Error("unreadable");

    const result = parseProductGrid({
      grid: read.rows,
      categories: LOOKUP,
      existingSkus: new Map(),
      remainingProductSlots: 1000,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problem.kind).toBe("no_rows");
  });

  it("reads the attached workbooks, which openpyxl wrote", async () => {
    // These two files are the format of record (docs/bulk-upload). They also
    // guard a real exceljs bug: it cannot find comment parts laid out the way
    // openpyxl writes them and throws a TypeError instead. Sellers' files come
    // from every tool imaginable, so the reader strips comments first — and
    // this is the test that proves it, against files we did not generate.
    for (const name of ["Bzaro_Demo_Products.xlsx", "Bzaro_Product_Upload_Template.xlsx"]) {
      const file = await readFile(`docs/bulk-upload/${name}`);
      const read = await readProductRows(new Uint8Array(file));
      expect(read.ok, `${name} must be readable`).toBe(true);
      if (!read.ok) continue;
      expect(read.rows[0]).toContain("Product Name *");
    }
  });

  it("imports the attached demo workbook with zero errors", async () => {
    const file = await readFile("docs/bulk-upload/Bzaro_Demo_Products.xlsx");
    const read = await readProductRows(new Uint8Array(file));
    if (!read.ok) throw new Error("unreadable");

    const result = expectOk(
      parseProductGrid({
        grid: read.rows,
        categories: LOOKUP,
        existingSkus: new Map(),
        remainingProductSlots: 1000,
      }),
    );

    expect(result.rows.flatMap((row) => row.issues.map(formatIssue))).toEqual([]);
    expect(result.counts.create).toBe(10);
  });
});

// ── Prices ──────────────────────────────────────────────────────────────────

describe("prices", () => {
  it("accepts the formats a spreadsheet actually contains", () => {
    expect(readPrice("1250")).toBe(1250);
    expect(readPrice("1,250")).toBe(1250);
    expect(readPrice("₹1,250")).toBe(1250);
    expect(readPrice("Rs. 1250")).toBe(1250);
    expect(readPrice("4.5")).toBe(4.5);
    expect(readPrice("1 250")).toBe(1250);
  });

  it("tells a blank price apart from a broken one", () => {
    // The distinction decides whether a re-upload keeps a product's price or
    // silently clears it, so it is the one that must not blur.
    expect(readPrice("")).toBeNull();
    expect(readPrice("   ")).toBeNull();
    expect(readPrice("abc")).toBeUndefined();
    expect(readPrice("1250 to 1400")).toBeUndefined();
    expect(readPrice("approx 500")).toBeUndefined();
  });

  it("reports a bad price against the Price column, with an example", () => {
    const result = expectOk(parse([validRow({ price: "85 rupees per piece" })]));
    const row = result.rows[0]!;

    expect(row.status).toBe("error");
    expect(formatIssue(row.issues[0]!)).toBe("Row 2 · Price (₹): write only a number, e.g. 85");
  });

  it("refuses a maximum price below the price", () => {
    const result = expectOk(parse([validRow({ price: "100", priceMax: "80" })]));
    expect(result.rows[0]!.status).toBe("error");
    expect(result.rows[0]!.issues[0]!.message).toContain("cannot be less than");
  });

  it("treats a blank price as price on request", () => {
    const result = expectOk(parse([validRow({ price: "" })]));
    expect(result.rows[0]!.status).toBe("new");
    expect(result.rows[0]!.input?.priceOnRequest).toBe(true);
  });
});

// ── Categories ──────────────────────────────────────────────────────────────

describe("categories", () => {
  it("matches a leaf by name, whatever the case", () => {
    const result = expectOk(parse([validRow({ subCategory: "led bulbs" })]));
    expect(result.rows[0]!.input?.categoryId).toBe("cledbulbs0000000000000001");
  });

  it("matches a leaf by slug", () => {
    const result = expectOk(parse([validRow({ subCategory: "house-wires" })]));
    expect(result.rows[0]!.input?.categoryId).toBe("chousewires00000000000003");
  });

  it("suggests the closest categories for an unknown one", () => {
    const result = expectOk(parse([validRow({ subCategory: "LED Bulb" })]));
    const row = result.rows[0]!;

    expect(row.status).toBe("error");
    // A seller who typed the singular should be shown the plural, not sent to
    // read a 358-row sheet.
    expect(row.issues[0]!.message).toContain("Did you mean");
    expect(row.issues[0]!.message).toContain("Led Bulbs");
  });

  it("points at the Categories sheet when nothing is close", () => {
    const result = expectOk(parse([validRow({ subCategory: "Zzzzqqq" })]));
    expect(result.rows[0]!.issues[0]!.message).toContain("'Categories' sheet");
  });

  it("uses the main category to separate two branches with the same leaf name", () => {
    // "Fittings" exists under Electronics and under Building & Construction.
    const result = expectOk(
      parse([
        validRow({ sku: "F-1", mainCategory: "Building & Construction", subCategory: "Fittings" }),
        validRow({ sku: "F-2", mainCategory: "Electronics & Electrical", subCategory: "Fittings" }),
      ]),
    );

    expect(result.rows[0]!.input?.categoryId).toBe("cplumbfittings00000000007");
    expect(result.rows[1]!.input?.categoryId).toBe("celecfittings000000000004");
  });

  it("asks rather than guessing when an ambiguous leaf has no usable main", () => {
    const result = expectOk(parse([validRow({ mainCategory: "Something Else", subCategory: "Fittings" })]));
    const row = result.rows[0]!;

    expect(row.status).toBe("error");
    expect(row.issues[0]!.message).toContain("more than one main category");
  });

  it("requires a sub category", () => {
    const result = expectOk(parse([validRow({ subCategory: "" })]));
    expect(result.rows[0]!.status).toBe("error");
  });
});

// ── SKUs ────────────────────────────────────────────────────────────────────

describe("SKUs", () => {
  it("errors on BOTH rows when a code is used twice", () => {
    const result = expectOk(
      parse([
        validRow({ name: "First", sku: "LED-9W" }),
        validRow({ name: "Second", sku: "LED-9W" }),
      ]),
    );

    // Neither row can be imported: the file does not say which product owns
    // the code, and picking one would file a product under the other's.
    expect(result.rows.map((row) => row.status)).toEqual(["error", "error"]);
    expect(result.rows[0]!.issues[0]!.message).toContain("row 3");
    expect(result.rows[1]!.issues[0]!.message).toContain("row 2");
    expect(result.counts.error).toBe(2);
  });

  it("catches a duplicate that differs only in case", () => {
    // The column is citext, so these ARE the same product.
    const result = expectOk(
      parse([validRow({ sku: "LED-9W" }), validRow({ name: "Other", sku: "led-9w" })]),
    );
    expect(result.rows.map((row) => row.status)).toEqual(["error", "error"]);
  });

  it("refuses characters that would break photo matching", () => {
    for (const sku of ["LED_9W", "LED 9W", "LED/9W"]) {
      const result = expectOk(parse([validRow({ sku })]));
      expect(result.rows[0]!.status, `${sku} should be refused`).toBe("error");
      expect(result.rows[0]!.issues[0]!.message).toContain("hyphen");
    }
  });

  it("requires a SKU", () => {
    const result = expectOk(parse([validRow({ sku: "" })]));
    expect(result.rows[0]!.issues[0]!.message).toContain("product code");
  });

  it("marks a row whose SKU this seller already has as an update", () => {
    const result = expectOk(
      parse([validRow({ sku: "LED-9W" })], {
        existingSkus: new Map([["led-9w", "product-123"]]),
      }),
    );

    const row = result.rows[0]!;
    expect(row.status).toBe("update");
    expect(row.productId).toBe("product-123");
    expect(result.counts.update).toBe(1);
    expect(result.counts.create).toBe(0);
  });
});

// ── File-level problems ─────────────────────────────────────────────────────

describe("the file as a whole", () => {
  it("refuses a file missing a required column, naming it", () => {
    const headers = HEADERS.filter((header) => !header.startsWith("SKU"));
    const grid = [
      headers,
      ...[["9W LED Bulb", "Electronics & Electrical", "LED Bulbs", "55"]],
    ];

    const result = parseProductGrid({
      grid,
      categories: LOOKUP,
      existingSkus: new Map(),
      remainingProductSlots: 1000,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem.kind).toBe("missing_columns");
    if (result.problem.kind === "missing_columns") {
      expect(result.problem.columns).toEqual(["SKU / Product Code *"]);
    }
  });

  it("refuses 1001 rows and says what the limit is", () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, index) =>
      validRow({ sku: `SKU-${index}`, name: `Product ${index}` }),
    );

    const result = parse(rows);

    expect(result.ok).toBe(false);
    if (result.ok || result.problem.kind !== "too_many_rows") {
      throw new Error("expected too_many_rows");
    }
    expect(result.problem.rows).toBe(1001);
    expect(result.problem.max).toBe(MAX_IMPORT_ROWS);
  });

  it("accepts exactly 1000 rows", () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS }, (_, index) =>
      validRow({ sku: `SKU-${index}`, name: `Product ${index}` }),
    );

    const result = expectOk(parse(rows));
    expect(result.counts.total).toBe(MAX_IMPORT_ROWS);
    expect(result.counts.error).toBe(0);
  });

  it("skips blank rows instead of counting them against the limit", () => {
    const result = expectOk(parse([validRow(), {}, {}, validRow({ sku: "LED-12W" })]));

    expect(result.counts.total).toBe(2);
    // Row numbers stay the seller's: the second product is on sheet row 5.
    expect(result.rows.map((row) => row.row)).toEqual([2, 5]);
  });

  it("matches headers by text, ignoring case, spacing and the asterisk", () => {
    const headers = [
      "product name",
      "SKU / PRODUCT CODE",
      "  Main Category  ",
      "Sub Category *",
      "Price",
      ...HEADERS.slice(5),
    ];

    const result = expectOk(parse([validRow()], { headers }));
    expect(result.rows[0]!.status).toBe("new");
  });

  it("still imports the valid rows when others are broken", () => {
    const result = expectOk(
      parse([
        validRow({ sku: "GOOD-1" }),
        validRow({ sku: "BAD-1", price: "ask me" }),
        validRow({ sku: "GOOD-2" }),
      ]),
    );

    expect(result.counts.create).toBe(2);
    expect(result.counts.error).toBe(1);
    expect(result.rows.map((row) => row.status)).toEqual(["new", "error", "new"]);
  });
});

// ── Plan limit ──────────────────────────────────────────────────────────────

describe("the plan limit", () => {
  it("imports the first rows that fit and marks the rest over limit", () => {
    const rows = Array.from({ length: 5 }, (_, index) =>
      validRow({ sku: `SKU-${index}`, name: `Product ${index}` }),
    );

    const result = expectOk(parse(rows, { remainingProductSlots: 2 }));

    // The first two, not an arbitrary two: the sheet order is the seller's
    // own priority order.
    expect(result.rows.map((row) => row.status)).toEqual([
      "new",
      "new",
      "over_limit",
      "over_limit",
      "over_limit",
    ]);
    expect(result.counts.overLimit).toBe(3);
  });

  it("never refuses an update, even with no room left", () => {
    // The product already exists and already counts against the limit, so
    // blocking the edit would strand the seller with no way to fix a price.
    const result = expectOk(
      parse([validRow({ sku: "LED-9W" })], {
        remainingProductSlots: 0,
        existingSkus: new Map([["led-9w", "product-123"]]),
      }),
    );

    expect(result.rows[0]!.status).toBe("update");
  });
});

// ── Cell readers ────────────────────────────────────────────────────────────

describe("specifications", () => {
  it("reads the documented Key: Value | Key: Value form", () => {
    expect(readSpecifications("Wattage: 9W | Colour: Cool White")).toEqual([
      { key: "Wattage", value: "9W" },
      { key: "Colour", value: "Cool White" },
    ]);
  });

  it("splits on the first colon only, so a value may contain one", () => {
    expect(readSpecifications("Warranty: 1 Year: Extended")).toEqual([
      { key: "Warranty", value: "1 Year: Extended" },
    ]);
  });

  it("treats an empty cell as no specifications", () => {
    expect(readSpecifications("")).toEqual([]);
  });

  it("refuses a segment with no colon rather than guessing", () => {
    expect(readSpecifications("Wattage 9W")).toBeUndefined();
    expect(readSpecifications("Wattage: 9W | Cool White")).toBeUndefined();
  });

  it("reports the format with an example when it cannot be read", () => {
    const result = expectOk(parse([validRow({ specifications: "Wattage 9W" })]));
    expect(result.rows[0]!.issues[0]!.message).toContain("Key: Value");
  });
});

describe("whole numbers", () => {
  it("accepts a quantity, blank, and a float that is really whole", () => {
    expect(readWholeNumber("100")).toBe(100);
    expect(readWholeNumber("1,000")).toBe(1000);
    expect(readWholeNumber("")).toBeNull();
    // Survives a round trip through a float column.
    expect(readWholeNumber("100.0")).toBe(100);
  });

  it("refuses a fraction and a zero", () => {
    expect(readWholeNumber("10.5")).toBeUndefined();
    expect(readWholeNumber("0")).toBeUndefined();
    expect(readWholeNumber("many")).toBeUndefined();
  });
});

describe("issue formatting", () => {
  it("reads as the seller sees it on screen", () => {
    expect(formatIssue({ row: 14, column: "Price (₹)", message: "write only a number, e.g. 85" })).toBe(
      "Row 14 · Price (₹): write only a number, e.g. 85",
    );
  });

  it("drops the column for a whole-row problem", () => {
    expect(formatIssue({ row: 14, column: "", message: "no room on your plan" })).toBe(
      "Row 14: no room on your plan",
    );
  });
});
