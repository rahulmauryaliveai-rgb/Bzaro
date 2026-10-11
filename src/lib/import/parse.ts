import { productSchema, SKU_PATTERN } from "@/lib/validation/catalog";
import type { ProductInput } from "@/lib/validation/catalog";
import { slugify } from "@/lib/utils/slug";
import {
  columnKeyForHeader,
  FIRST_DATA_ROW,
  headerFor,
  IMPORT_COLUMNS,
  MAX_IMPORT_ROWS,
  REQUIRED_COLUMN_KEYS,
  type ImportColumnKey,
} from "@/lib/import/columns";

/**
 * Turning a grid of strings into products (D49).
 *
 * Pure: no database, no request, no clock. Everything it needs about the
 * seller — the categories that exist, the SKUs they already use, how many
 * products their plan still allows — arrives as arguments. That is what makes
 * the rules unit-testable against a literal array, and it is also why the
 * preview and the import cannot disagree: both run this same function over the
 * same rows.
 *
 * ── Messages are written for a trader, not a developer ──────────────────────
 * "Price: write only a number, e.g. 85" and not "Expected number, received
 * string". The person reading this is on a phone, in a shop, and has forty
 * other rows to fix. Every message names the column, says what to do, and
 * where it helps, shows an example.
 *
 * ── Why rows are validated twice ────────────────────────────────────────────
 * Each column is checked here with its own friendly message, and the assembled
 * product is then run through `productSchema` — the same schema the
 * single-product form uses. The explicit pass exists for the messages and for
 * the formats only a spreadsheet produces ("₹1,250"); the schema pass is the
 * authority, so a rule added to the form can never be missing from the import.
 */

export type RowStatus =
  /** Will be created, as a draft. */
  | "new"
  /** The SKU matches a product this seller already has. */
  | "update"
  | "error"
  /** Valid, but the plan has no room for another product. */
  | "over_limit";

export type RowIssue = {
  /** 1-based sheet row, as the seller sees it in Excel. */
  row: number;
  /** The column's header text, or "" for a whole-row problem. */
  column: string;
  message: string;
};

export type ParsedRow = {
  row: number;
  status: RowStatus;
  name: string;
  sku: string;
  /** Set unless the row is in error: what would be written. */
  input: ProductInput | null;
  /** The product this row updates. */
  productId: string | null;
  /** "Electronics & Electrical > Lighting > LED Bulbs", for the preview. */
  categoryPath: string | null;
  issues: RowIssue[];
  /** The cells as they arrived, for the error-report download. */
  cells: Record<ImportColumnKey, string>;
};

/** A problem with the FILE, where no row-by-row preview is possible. */
export type FileProblem =
  | { kind: "missing_columns"; columns: string[] }
  | { kind: "too_many_rows"; rows: number; max: number }
  | { kind: "no_rows" };

export type ParseResult =
  | {
      ok: true;
      rows: ParsedRow[];
      counts: { total: number; create: number; update: number; error: number; overLimit: number };
    }
  | { ok: false; problem: FileProblem };

/** One leaf category, as the parser needs to match it. */
export type CategoryLookup = {
  /** Leaf name AND slug, lower-cased, → category id. */
  byName: Map<string, string>;
  /** Category id → "Main > Mid > Leaf", for the preview. */
  pathById: Map<string, string>;
  /** Lower-cased leaf names that exist in more than one branch. */
  ambiguous: Set<string>;
};

export type ParseOptions = {
  /** Row 0 is the header row. */
  grid: string[][];
  categories: CategoryLookup;
  /** This seller's saved SKUs, lower-cased → product id. */
  existingSkus: Map<string, string>;
  /**
   * How many MORE products the plan allows. Updates do not consume a slot, so
   * only new rows are counted against it.
   */
  remainingProductSlots: number;
};

export function parseProductGrid(options: ParseOptions): ParseResult {
  const { grid, categories, existingSkus, remainingProductSlots } = options;

  if (grid.length === 0) return { ok: false, problem: { kind: "no_rows" } };

  const columnIndex = mapColumns(grid[0]!);

  const missing = REQUIRED_COLUMN_KEYS.filter((key) => !columnIndex.has(key));
  if (missing.length > 0) {
    return { ok: false, problem: { kind: "missing_columns", columns: missing.map(headerFor) } };
  }

  // Blank rows are skipped, not counted: a seller who deletes the contents of
  // row 40 and leaves the row there has 999 products, not a file over the
  // limit. The cap is on real products.
  const dataRows: Array<{ row: number; cells: Record<ImportColumnKey, string> }> = [];

  for (let index = 1; index < grid.length; index += 1) {
    const cells = readCells(grid[index]!, columnIndex);
    if (IMPORT_COLUMNS.every((column) => cells[column.key] === "")) continue;
    // Sheet row numbers, so "Row 14" means row 14 in Excel.
    dataRows.push({ row: index + 1, cells });
  }

  if (dataRows.length === 0) return { ok: false, problem: { kind: "no_rows" } };

  if (dataRows.length > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      problem: { kind: "too_many_rows", rows: dataRows.length, max: MAX_IMPORT_ROWS },
    };
  }

  const duplicates = duplicateSkuRows(dataRows);

  const rows: ParsedRow[] = dataRows.map(({ row, cells }) =>
    validateRow({ row, cells, categories, existingSkus, duplicates }),
  );

  applyPlanLimit(rows, remainingProductSlots);

  return { ok: true, rows, counts: countRows(rows) };
}

/**
 * Header row → where each column landed.
 *
 * Matched by TEXT, not position, so a seller who reorders or inserts a column
 * still imports. The first match wins: a duplicated header (copy-paste
 * accident) uses the leftmost, which is the one holding the data in every case
 * seen so far.
 */
function mapColumns(header: string[]): Map<ImportColumnKey, number> {
  const found = new Map<ImportColumnKey, number>();

  header.forEach((text, index) => {
    const key = columnKeyForHeader(text);
    if (key && !found.has(key)) found.set(key, index);
  });

  return found;
}

function readCells(
  row: string[],
  columnIndex: Map<ImportColumnKey, number>,
): Record<ImportColumnKey, string> {
  const cells = {} as Record<ImportColumnKey, string>;

  for (const column of IMPORT_COLUMNS) {
    const index = columnIndex.get(column.key);
    cells[column.key] = index === undefined ? "" : (row[index] ?? "").trim();
  }

  return cells;
}

/**
 * SKUs used by more than one row in this file.
 *
 * Both rows are errors, not "first one wins": the file does not say which
 * product the code belongs to, and picking one would import a product under a
 * code the seller meant for the other. Compared case-insensitively, because
 * the column is citext — "LED-9W" and "led-9w" ARE the same product.
 */
function duplicateSkuRows(
  dataRows: Array<{ row: number; cells: Record<ImportColumnKey, string> }>,
): Map<string, number[]> {
  const seen = new Map<string, number[]>();

  for (const { row, cells } of dataRows) {
    const key = cells.sku.toLowerCase();
    if (!key) continue;
    const rows = seen.get(key);
    if (rows) rows.push(row);
    else seen.set(key, [row]);
  }

  return new Map([...seen].filter(([, rows]) => rows.length > 1));
}

type RowContext = {
  row: number;
  cells: Record<ImportColumnKey, string>;
  categories: CategoryLookup;
  existingSkus: Map<string, string>;
  duplicates: Map<string, number[]>;
};

function validateRow(context: RowContext): ParsedRow {
  const { row, cells, categories, existingSkus, duplicates } = context;

  const issues: RowIssue[] = [];
  const fail = (key: ImportColumnKey | null, message: string) =>
    issues.push({ row, column: key ? headerFor(key) : "", message });

  // ── Name ──
  if (!cells.name) fail("name", "write the product name");
  else if (cells.name.length < 2) fail("name", "the name is too short");
  else if (cells.name.length > 200) fail("name", "keep the name under 200 letters");

  // ── SKU ──
  const sku = cells.sku;

  if (!sku) {
    fail("sku", "write a product code (SKU), e.g. LED-9W-CW");
  } else if (sku.length > 60) {
    fail("sku", "keep the code under 60 letters");
  } else if (!SKU_PATTERN.test(sku)) {
    fail("sku", "use letters, numbers and hyphen (-) only, e.g. LED-9W-CW");
  } else {
    const others = duplicates.get(sku.toLowerCase());
    if (others) {
      const elsewhere = others.filter((other) => other !== row);
      fail(
        "sku",
        `this code is also in row ${elsewhere.join(", ")}. Give every product its own code.`,
      );
    }
  }

  // ── Category ──
  const category = resolveCategory(cells, categories);
  if (category.message) fail("subCategory", category.message);

  // ── Prices ──
  const price = readPrice(cells.price);
  if (price === undefined) fail("price", "write only a number, e.g. 85");

  const priceMax = readPrice(cells.priceMax);
  if (priceMax === undefined) fail("priceMax", "write only a number, e.g. 110");

  if (price !== undefined && price !== null && priceMax !== undefined && priceMax !== null) {
    if (priceMax < price) fail("priceMax", "the maximum price cannot be less than the price");
  }

  // ── Min order quantity ──
  const minOrderQty = readWholeNumber(cells.minOrderQty);
  if (minOrderQty === undefined) fail("minOrderQty", "write a whole number, e.g. 100");

  // ── Specifications ──
  const specifications = readSpecifications(cells.specifications);
  if (specifications === undefined) {
    fail(
      "specifications",
      "write them as Key: Value | Key: Value, e.g. Wattage: 9W | Colour: Cool White",
    );
  } else if (specifications.length > 30) {
    fail("specifications", "keep it to 30 specifications");
  }

  const tags = readTags(cells.tags);
  if (tags.length > 20) fail("tags", "keep it to 20 tags");

  // ── Lengths that protect the public page ──
  const capped: Array<[ImportColumnKey, number]> = [
    ["brand", 100],
    ["modelNumber", 60],
    ["shortDescription", 300],
    ["description", 5000],
    ["unit", 40],
  ];

  for (const [key, max] of capped) {
    if (cells[key].length > max) fail(key, `keep this under ${max} letters`);
  }

  const existingId = sku ? (existingSkus.get(sku.toLowerCase()) ?? null) : null;

  // The friendly pass found problems, so the row is not importable. Returning
  // here keeps the schema's own wording — written for a form, not a
  // spreadsheet — out of the preview.
  if (issues.length > 0) {
    return {
      row,
      status: "error",
      name: cells.name,
      sku,
      input: null,
      productId: existingId,
      categoryPath: category.path,
      issues,
      cells,
    };
  }

  const input: Record<string, unknown> = {
    name: cells.name,
    slug: slugify(cells.name) || slugify(sku),
    categoryId: category.id ?? "",
    shortDescription: cells.shortDescription,
    description: cells.description,
    brand: cells.brand,
    sku,
    modelNumber: cells.modelNumber,
    price: price === null ? "" : String(price),
    priceMax: priceMax === null ? "" : String(priceMax),
    currency: "INR",
    unit: cells.unit,
    minOrderQty: minOrderQty === null ? "" : String(minOrderQty),
    // A row with no price is "ask for price" — the normal case in this market,
    // not a missing field.
    priceOnRequest: price === null,
    specifications: specifications ?? [],
    tags,
    images: [],
    metaTitle: "",
    metaDescription: "",
    // Never PUBLISHED from a spreadsheet. A product with no photograph is a
    // poor listing, and publishing forty of them on the seller's behalf is not
    // a decision an import gets to make.
    status: "DRAFT",
  };

  const parsed = productSchema.safeParse(input);

  if (!parsed.success) {
    // The authoritative pass disagreed. Report it against the right column so
    // the seller still knows where to look, even though the wording is the
    // form's.
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "");
      const key = IMPORT_COLUMNS.find((column) => column.key === field)?.key ?? null;
      fail(key, issue.message);
    }

    return {
      row,
      status: "error",
      name: cells.name,
      sku,
      input: null,
      productId: existingId,
      categoryPath: category.path,
      issues,
      cells,
    };
  }

  return {
    row,
    status: existingId ? "update" : "new",
    name: cells.name,
    sku,
    input: parsed.data,
    productId: existingId,
    categoryPath: category.path,
    issues: [],
    cells,
  };
}

// ── Category matching ───────────────────────────────────────────────────────

/**
 * Resolve Sub Category to a leaf id.
 *
 * Sub Category alone decides it: it is the leaf, and the leaf determines the
 * whole path. Main Category is used only to disambiguate a leaf name that
 * exists in two branches, and otherwise ignored — a seller who picks the right
 * sub-category and the wrong main has made a typo, not an error worth refusing
 * a product over.
 */
function resolveCategory(
  cells: Record<ImportColumnKey, string>,
  categories: CategoryLookup,
): { id: string | null; path: string | null; message: string | null } {
  const wanted = cells.subCategory.trim();

  if (!wanted) {
    return { id: null, path: null, message: "choose a sub category from the list" };
  }

  const key = wanted.toLowerCase();

  if (categories.ambiguous.has(key)) {
    // Two branches own this name. The main category decides, and if it does
    // not match either, the seller has to say which one they mean.
    const viaMain = categories.byName.get(`${cells.mainCategory.trim().toLowerCase()} > ${key}`);
    if (viaMain) {
      return { id: viaMain, path: categories.pathById.get(viaMain) ?? null, message: null };
    }
    return {
      id: null,
      path: null,
      message:
        `"${wanted}" exists under more than one main category. ` +
        `Check the Main Category column against the 'Categories' sheet.`,
    };
  }

  const id = categories.byName.get(key);

  if (id) return { id, path: categories.pathById.get(id) ?? null, message: null };

  const suggestions = closestNames(wanted, categories.byName);

  return {
    id: null,
    path: null,
    message:
      suggestions.length > 0
        ? `"${wanted}" is not a category. Did you mean ${suggestions.join(", ")}?`
        : `"${wanted}" is not a category. Pick one from the 'Categories' sheet.`,
  };
}

/**
 * Up to three plausible alternatives for an unknown category.
 *
 * Shared-word overlap first, then edit distance. Overlap is what catches the
 * realistic mistakes — "LED Bulb" for "LED Bulbs", "Steel Pipe" for "Steel
 * Pipes & Tubes" — where edit distance over a long multi-word name is too
 * blunt to rank well.
 */
function closestNames(wanted: string, byName: Map<string, string>): string[] {
  const target = wanted.toLowerCase();
  const wantedWords = new Set(words(target));

  const scored: Array<{ name: string; score: number }> = [];
  const seen = new Set<string>();

  for (const candidate of byName.keys()) {
    // Slugs are in the same index as a matching convenience; suggesting one
    // back to a seller would be suggesting something they never typed.
    if (candidate.includes("-") && !target.includes("-")) continue;
    if (candidate.includes(" > ")) continue;
    if (seen.has(candidate)) continue;
    seen.add(candidate);

    const candidateWords = new Set(words(candidate));
    let shared = 0;
    for (const word of wantedWords) if (candidateWords.has(word)) shared += 1;

    const overlap = shared / Math.max(wantedWords.size, candidateWords.size, 1);
    const distance = editDistance(target, candidate);
    const closeness = 1 - distance / Math.max(target.length, candidate.length, 1);

    const score = overlap * 2 + closeness;
    if (overlap > 0 || closeness > 0.6) scored.push({ name: candidate, score });
  }

  return scored
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map((entry) => titleish(entry.name));
}

function words(value: string): string[] {
  return value.split(/[^a-z0-9]+/i).filter((word) => word.length > 1);
}

/** Capitalise a lower-cased index key enough to look like the real name. */
function titleish(value: string): string {
  return value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

/**
 * Levenshtein distance, two rows at a time.
 *
 * Run against ~360 category names per unknown cell, so the full matrix is
 * avoided; only the previous row is ever needed.
 */
function editDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];

    for (let j = 1; j <= right.length; j += 1) {
      const substitution = previous[j - 1]! + (left[i - 1] === right[j - 1] ? 0 : 1);
      current[j] = Math.min(current[j - 1]! + 1, previous[j]! + 1, substitution);
    }

    previous = current;
  }

  return previous[right.length]!;
}

// ── Cell readers ────────────────────────────────────────────────────────────

/**
 * A price as typed in a spreadsheet.
 *
 * `null` means the cell was blank — "ask for price", which is this market's
 * default. `undefined` means it held something that is not a price, which is
 * an error. The two must stay distinct: collapsing them would silently clear
 * the price of every product whose price cell a seller fat-fingered.
 *
 * Accepts "1250", "1,250", "₹1,250", "1 250" and "Rs. 1250", because all five
 * arrive. Rejects "1250/-", "approx 1250" and "1250 to 1400" — a range in one
 * cell has a column of its own, and guessing which end is meant would publish
 * a wrong price.
 */
export function readPrice(raw: string): number | null | undefined {
  const text = raw.trim();
  if (text === "") return null;

  const cleaned = text
    .replace(/^(?:rs\.?|inr)\s*/i, "")
    .replace(/[₹$€£,\s]/g, "")
    .replace(/\/-$/, "");

  if (cleaned === "") return null;
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return undefined;

  const value = Number(cleaned);
  if (!Number.isFinite(value)) return undefined;

  // Two decimal places: the column is money, and the database stores paise.
  return Math.round(value * 100) / 100;
}

/** Blank → null, a whole number → it, anything else → undefined (an error). */
export function readWholeNumber(raw: string): number | null | undefined {
  const text = raw.trim().replace(/[,\s]/g, "");
  if (text === "") return null;

  // "100.0" is a whole number that survived a round trip through a float
  // column, and refusing it would be pedantry.
  if (!/^\d+(\.0+)?$/.test(text)) return undefined;

  const value = Number.parseInt(text, 10);
  if (!Number.isFinite(value) || value < 1 || value > 9_999_999) return undefined;

  return value;
}

/**
 * "Wattage: 9W | Colour: Cool White" → rows.
 *
 * `|` separates, the FIRST `:` splits — so "Warranty: 1 Year: Extended" keeps
 * the colon in the value rather than being rejected. A segment with no colon
 * at all is an error: it is ambiguous whether it was meant as a key or a
 * value, and importing it as either produces a wrong specification table on a
 * public page.
 */
export function readSpecifications(
  raw: string,
): Array<{ key: string; value: string }> | undefined {
  const text = raw.trim();
  if (text === "") return [];

  const rows: Array<{ key: string; value: string }> = [];

  for (const segment of text.split("|")) {
    const part = segment.trim();
    if (part === "") continue;

    const colon = part.indexOf(":");
    if (colon <= 0) return undefined;

    const key = part.slice(0, colon).trim();
    const value = part.slice(colon + 1).trim();

    if (!key || !value) return undefined;
    // Capped here as well as in the schema so the message names the column.
    if (key.length > 60 || value.length > 200) return undefined;

    rows.push({ key, value });
  }

  return rows;
}

/**
 * "led bulb, 9w bulb" → tags.
 *
 * Newlines count as separators too: a seller who pressed Alt+Enter between
 * tags meant a list, and importing the whole block as one 40-character tag
 * would be obtuse. De-duplication and lower-casing happen in the schema.
 */
export function readTags(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 40);
}

// ── Plan limit ──────────────────────────────────────────────────────────────

/**
 * Mark the new rows that do not fit the plan.
 *
 * Counted from the top of the file, so a seller whose plan allows ten more
 * products gets the FIRST ten, not an arbitrary ten — the order they put them
 * in the sheet is the order they prioritised them in.
 *
 * Updates are never refused: the product already exists and already counts
 * against the limit, so refusing to edit it would strand a seller over their
 * limit with no way to correct a price.
 */
function applyPlanLimit(rows: ParsedRow[], remaining: number): void {
  let left = Math.max(0, remaining);

  for (const row of rows) {
    if (row.status !== "new") continue;

    if (left > 0) {
      left -= 1;
      continue;
    }

    row.status = "over_limit";
    row.issues = [
      {
        row: row.row,
        column: "",
        message: "Your plan has no room for another product. Upgrade to import this row.",
      },
    ];
  }
}

function countRows(rows: ParsedRow[]) {
  return {
    total: rows.length,
    create: rows.filter((row) => row.status === "new").length,
    update: rows.filter((row) => row.status === "update").length,
    error: rows.filter((row) => row.status === "error").length,
    overLimit: rows.filter((row) => row.status === "over_limit").length,
  };
}

/**
 * "Row 14 · Price: write only a number, e.g. 85"
 *
 * One formatter, so the preview, the error report and the import history all
 * phrase a problem the same way. A seller comparing the screen against the
 * downloaded report should not have to work out that two differently-worded
 * lines are the same problem.
 */
export function formatIssue(issue: RowIssue): string {
  return issue.column
    ? `Row ${issue.row} · ${issue.column}: ${issue.message}`
    : `Row ${issue.row}: ${issue.message}`;
}

export { MAX_IMPORT_ROWS, FIRST_DATA_ROW };
