import ExcelJS from "exceljs";
import {
  FIRST_DATA_ROW,
  IMPORT_COLUMNS,
  LAST_DATA_ROW,
  MAX_IMPORT_ROWS,
  SHEET_NAMES,
  TEMPLATE_VERSION,
  UNIT_OPTIONS,
  type ImportColumn,
} from "@/lib/import/columns";
import { DEMO_PRODUCTS } from "@/lib/import/demo-products";

/**
 * The upload template and the demo workbook (D49).
 *
 * ── Generated, never a checked-in file ──────────────────────────────────────
 * Both are built here from the live taxonomy on every download. A checked-in
 * .xlsx goes stale the first time an admin adds a category: the dropdown stops
 * offering it, and a seller who types the new name by hand gets "unknown
 * category" from an importer that does know it. Generating means a new
 * category appears in the template the moment it is active, with nobody
 * remembering to regenerate anything.
 *
 * ── Four sheets, each earning its place ─────────────────────────────────────
 *   How to Upload  Instructions, in the order the seller will need them, so
 *                  the file explains itself when it is mailed to a nephew to
 *                  fill in.
 *   Products       The one sheet that is read back.
 *   Categories     The flat list, searchable with the autofilter — the
 *                  dependent dropdown is unusable for "which category is my
 *                  product in", which is the actual question.
 *   Lists          Hidden. Dropdown sources only. Hidden rather than absent
 *                  because Excel's dependent-dropdown trick (VLOOKUP into
 *                  INDIRECT) needs real named ranges in the file.
 *
 * ── The dependent dropdown ──────────────────────────────────────────────────
 * Sub Category offers only the children of the chosen Main Category, via
 * `INDIRECT(VLOOKUP($C2, MainMap, 2, FALSE))`: column A of Lists holds the
 * main names, column B the name of that main's range ("sub_7"), and columns F
 * onward hold one main's leaves each. It is the only way to express a
 * dependent list in a plain .xlsx with no macros.
 *
 * Every validation is ADVISORY. Excel enforces it while typing, but a seller
 * who pastes a block of cells bypasses validation entirely — Excel does not
 * re-check pasted values — and LibreOffice and Google Sheets honour only parts
 * of it. The server re-validates every row regardless (`parse.ts`); nothing
 * here is a correctness guarantee, it is help at the point of typing.
 */

// ── Palette ─────────────────────────────────────────────────────────────────
const BRAND = "FF0B4A99";
/** Optional columns get a lighter header, so "*" is not the only signal. */
const BRAND_LIGHT = "FF5B7DB1";
const MUTED = "FF5A6475";
const BORDER = "FFD0D7E2";
const FAINT = "FF98A2B3";
const WHITE = "FFFFFFFF";

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: BORDER } },
  left: { style: "thin", color: { argb: BORDER } },
  bottom: { style: "thin", color: { argb: BORDER } },
  right: { style: "thin", color: { argb: BORDER } },
};

/** Number formats, matching the attached workbooks. */
const NUMBER_FORMAT = {
  /** 1,234.5 — trailing zeros dropped, so 55 is not shown as 55.00. */
  decimal: "#,##0.##",
  integer: "0",
  /** Forces text, so a SKU of `0012` survives as typed. */
  text: "@",
} as const;

/** One leaf category as the template needs it. */
export type TemplateCategory = {
  id: string;
  /** The root ancestor's name — the Main Category column. */
  main: string;
  /** The leaf's own name — the Sub Category column. */
  sub: string;
  /** "Electronics & Electrical > Lighting > LED Bulbs". */
  fullPath: string;
};

export type TemplateOptions = {
  categories: readonly TemplateCategory[];
  /** Fill the Products sheet with the ten worked examples. */
  demo?: boolean;
};

export async function buildTemplateWorkbook(options: TemplateOptions): Promise<Buffer> {
  const { categories, demo = false } = options;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Bzaro";
  workbook.lastModifiedBy = "Bzaro";
  workbook.created = new Date();
  workbook.modified = new Date();

  // The demo opens on Products, where the examples are; the blank template
  // opens on the instructions, which is what a first-time seller needs.
  // The window geometry is required by the type and ignored by Excel, which
  // sizes the window itself.
  workbook.views = [
    {
      x: 0,
      y: 0,
      width: 12_000,
      height: 24_000,
      firstSheet: 0,
      activeTab: demo ? 1 : 0,
      visibility: "visible",
    },
  ];

  const grouped = groupByMain(categories);

  writeHowToSheet(workbook, demo);
  writeProductsSheet(workbook, demo);
  writeCategoriesSheet(workbook, categories);
  writeListsSheet(workbook, grouped);
  addDefinedNames(workbook, grouped);

  // `as Buffer`: exceljs types this as its own Buffer-alike, which is a Node
  // Buffer at runtime.
  const written = await workbook.xlsx.writeBuffer();
  return Buffer.from(written as ArrayBuffer);
}

/** Main category name → its leaves, in taxonomy order. */
type Grouped = Array<{ main: string; subs: string[] }>;

function groupByMain(categories: readonly TemplateCategory[]): Grouped {
  const byMain = new Map<string, string[]>();

  for (const category of categories) {
    const subs = byMain.get(category.main);
    if (subs) subs.push(category.sub);
    else byMain.set(category.main, [category.sub]);
  }

  return [...byMain].map(([main, subs]) => ({ main, subs }));
}

// ══════════════════════════ How to Upload ════════════════════════════════════

function writeHowToSheet(workbook: ExcelJS.Workbook, demo: boolean): void {
  const sheet = workbook.addWorksheet(SHEET_NAMES.howTo);
  sheet.views = [{ showGridLines: false }];

  // A narrow gutter column, a label column, a wide text column.
  sheet.getColumn(1).width = 3;
  sheet.getColumn(2).width = 26;
  sheet.getColumn(3).width = 95;

  const title = (row: number, text: string) => {
    const cell = sheet.getCell(row, 2);
    cell.value = text;
    cell.font = { name: "Arial", size: 18, bold: true, color: { argb: BRAND } };
  };

  const subtitle = (row: number, text: string) => {
    const cell = sheet.getCell(row, 2);
    cell.value = text;
    cell.font = { name: "Arial", size: 11, italic: true, color: { argb: MUTED } };
  };

  const heading = (row: number, text: string) => {
    const cell = sheet.getCell(row, 2);
    cell.value = text;
    cell.font = { name: "Arial", size: 13, bold: true, color: { argb: BRAND } };
  };

  /** A step: blue label in column B, English explanation in column C. */
  const step = (row: number, label: string, text: string) => {
    const name = sheet.getCell(row, 2);
    name.value = label;
    name.font = { name: "Arial", size: 11, bold: true, color: { argb: BRAND } };
    body(row, text);
  };

  const body = (row: number, text: string) => {
    const cell = sheet.getCell(row, 3);
    cell.value = text;
    cell.font = { name: "Arial", size: 11 };
  };

  /** The Hinglish restatement under an English line. */
  const hinglish = (row: number, text: string) => {
    const cell = sheet.getCell(row, 3);
    cell.value = text;
    cell.font = { name: "Arial", size: 10, italic: true, color: { argb: MUTED } };
  };

  const label = (row: number, text: string) => {
    const cell = sheet.getCell(row, 2);
    cell.value = text;
    cell.font = { name: "Arial", size: 11, bold: true };
  };

  /** A file name example, in a monospaced font so the `_2` is unmissable. */
  const code = (row: number, text: string) => {
    const cell = sheet.getCell(row, 2);
    cell.value = text;
    cell.font = { name: "Consolas", size: 11, bold: true };
  };

  /** A rule: bold label, wrapped explanation. */
  const rule = (row: number, name: string, text: string) => {
    const key = sheet.getCell(row, 2);
    key.value = name;
    key.font = { name: "Arial", size: 11, bold: true };
    key.alignment = { vertical: "top" };

    const value = sheet.getCell(row, 3);
    value.value = text;
    value.font = { name: "Arial", size: 11 };
    value.alignment = { vertical: "top", wrapText: true };
  };

  title(2, "Bzaro — Bulk Product Upload");
  subtitle(
    3,
    demo
      ? "DEMO FILE — sample products to show the format. Isse dekh kar apni file bharein."
      : "Apne saare products ek saath upload karein — 3 aasaan steps.",
  );

  step(
    5,
    "Step 1 — Fill products",
    "Go to the 'Products' sheet. One row = one product. Columns with * are required.",
  );
  hinglish(6, "'Products' sheet mein har line par ek product likhein. * wale columns zaroori hain.");

  step(
    8,
    "Step 2 — Upload this file",
    "Seller Dashboard → Products → Bulk Upload → Upload Excel. Fix any red rows shown on screen.",
  );
  hinglish(9, "Dashboard par file upload karein. Koi galti hogi to screen par row number ke saath dikhegi.");

  step(
    11,
    "Step 3 — Upload photos",
    "Name each photo with its SKU, then select all photos together and upload.",
  );
  hinglish(12, "Har photo ka naam uske SKU se rakhein, phir saari photos ek saath upload karein.");

  heading(14, "Photo naming");
  code(15, "LED-9W-CW.jpg");
  body(15, "One photo → main photo of product LED-9W-CW");
  code(16, "LED-9W-CW_1.jpg");
  body(16, "Photo 1 (main photo)");
  code(17, "LED-9W-CW_2.jpg");
  body(17, "Photo 2 — and so on, up to _12 (12 photos max per product)");
  label(18, "Allowed");
  body(18, "JPG, PNG or WEBP · up to 5 MB each · at least 500 × 500 px, square looks best");
  label(19, "Tip");
  body(19, "Photo ka naam SKU se bilkul same hona chahiye (capital/small letter se farak nahi padta).");

  heading(21, "Rules");
  rule(
    22,
    "SKU",
    "Unique for every product. Only letters, numbers and hyphen (-). Same SKU dobara upload karenge to product UPDATE hoga, naya nahi banega.",
  );
  rule(23, "Price", "Numbers only (55 or 4.5). Leave blank for 'Ask for Price'. No ₹ sign or commas.");
  rule(
    24,
    "Category",
    "Pick Main Category first, then Sub Category from the dropdown. See 'Categories' sheet for the full list.",
  );
  rule(25, "Specifications", "Key: Value | Key: Value   →   Wattage: 9W | Colour: Cool White");
  rule(26, "Search Tags", "Comma separated   →   led bulb, 9w bulb, cool white");
  rule(27, "Limit", `Up to ${MAX_IMPORT_ROWS} products per file. More products? Use another file.`);
  rule(
    28,
    "Do not",
    "Do not rename sheets, change column headers or add columns — file upload nahi hogi.",
  );
  rule(
    29,
    "After upload",
    "Products are saved as Draft. Photo lagne ke baad 'Publish' karein — then buyers can see them.",
  );

  label(31, "Need help?");
  body(31, "Download the Demo Excel from your dashboard to see filled examples.");

  // Stamped so a seller mailing in a file from six months ago can be told
  // which template it came from.
  for (const column of [2, 3]) {
    const cell = sheet.getCell(33, column);
    cell.value = column === 2 ? "Template version" : TEMPLATE_VERSION;
    cell.font = { name: "Arial", size: 9, color: { argb: FAINT } };
  }
}

// ══════════════════════════════ Products ═════════════════════════════════════

function writeProductsSheet(workbook: ExcelJS.Workbook, demo: boolean): void {
  const sheet = workbook.addWorksheet(SHEET_NAMES.products);

  // Freeze the header AND the first two columns: on a laptop the seller is
  // typing a description in column L and needs to still see which product
  // (A) and which SKU (B) the row is.
  sheet.views = [{ state: "frozen", xSplit: 2, ySplit: 1 }];

  IMPORT_COLUMNS.forEach((column, index) => {
    sheet.getColumn(index + 1).width = column.width;
  });

  const header = sheet.getRow(1);
  header.height = 34;

  IMPORT_COLUMNS.forEach((column, index) => {
    const cell = header.getCell(index + 1);
    cell.value = column.header;
    cell.font = { name: "Arial", size: 11, bold: true, color: { argb: WHITE } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: column.required ? BRAND : BRAND_LIGHT },
    };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = THIN_BORDER;
    // The long explanation lives in a hover note rather than a help row, so
    // row 2 is where data starts and the parser needs no special cases.
    cell.note = column.note;
  });

  const rows = demo ? DEMO_PRODUCTS : [];

  // Style the whole 1000-row block, not just the filled part: an unstyled row
  // 400 accepts a price as text, and a SKU typed into an unformatted cell can
  // be reformatted by Excel into a number or a date.
  for (let rowNumber = FIRST_DATA_ROW; rowNumber <= LAST_DATA_ROW; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const values = rows[rowNumber - FIRST_DATA_ROW];

    // Demo rows are taller: two of them carry a two-line description.
    if (values) row.height = 45;

    IMPORT_COLUMNS.forEach((column, index) => {
      const cell = row.getCell(index + 1);
      applyDataStyle(cell, column);
      const value = values?.[column.key];
      if (value !== undefined) cell.value = value;
    });
  }

  addProductValidations(sheet);
}

function applyDataStyle(cell: ExcelJS.Cell, column: ImportColumn): void {
  cell.font = { name: "Arial", size: 10 };
  cell.border = THIN_BORDER;
  cell.alignment = { vertical: "top", wrapText: column.format === "wrap" };

  if (column.format === "decimal") cell.numFmt = NUMBER_FORMAT.decimal;
  else if (column.format === "integer") cell.numFmt = NUMBER_FORMAT.integer;
  else if (column.format === "text") cell.numFmt = NUMBER_FORMAT.text;
}

/**
 * Column letter for a 1-based index: 1 → A, 27 → AA.
 *
 * The Lists sheet needs one column per main category — 51 today, so well past
 * Z — and the named ranges are built as text.
 */
function columnLetter(index: number): string {
  let letters = "";
  let remaining = index;

  while (remaining > 0) {
    const remainder = (remaining - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    remaining = Math.floor((remaining - 1) / 26);
  }

  return letters;
}

/**
 * `worksheet.dataValidations` is real at runtime but missing from exceljs's
 * published typings, which only expose the per-CELL `cell.dataValidation`.
 *
 * The range form is the one wanted: it writes a single `<dataValidation>` with
 * `sqref="A2:A1001"`, where setting the same rule on 1000 cells individually
 * would be 1000 model entries built to say one thing. Declared here rather
 * than cast at the call site so the shape being relied on is written down.
 */
type RangeValidations = {
  dataValidations: { add(range: string, validation: ExcelJS.DataValidation): void };
};

function addProductValidations(sheet: ExcelJS.Worksheet): void {
  const ranged = sheet as unknown as RangeValidations;

  /** Apply one validation down a whole column's data range. */
  const forColumn = (key: string, validation: ExcelJS.DataValidation) => {
    const index = IMPORT_COLUMNS.findIndex((column) => column.key === key);
    if (index < 0) return;
    const letter = columnLetter(index + 1);
    ranged.dataValidations.add(`${letter}${FIRST_DATA_ROW}:${letter}${LAST_DATA_ROW}`, validation);
  };

  forColumn("name", {
    type: "textLength",
    operator: "between",
    allowBlank: true,
    formulae: [2, 200],
    showErrorMessage: true,
    errorTitle: "Product Name",
    error: "Product name 2 se 200 letters ke beech hona chahiye.",
  });

  // Length, character set and in-file uniqueness in one formula, because Excel
  // allows a single validation per cell. COUNTIF over the whole column is what
  // catches the duplicate while the seller is still typing it; the server
  // catches it again at preview, where it can also see the saved catalogue.
  forColumn("sku", {
    type: "custom",
    allowBlank: true,
    formulae: [
      `=AND(LEN(B${FIRST_DATA_ROW})<=60,ISERROR(FIND(" ",B${FIRST_DATA_ROW})),` +
        `ISERROR(FIND("_",B${FIRST_DATA_ROW})),ISERROR(FIND("/",B${FIRST_DATA_ROW})),` +
        `COUNTIF($B$${FIRST_DATA_ROW}:$B$${LAST_DATA_ROW},B${FIRST_DATA_ROW})=1)`,
    ],
    showErrorMessage: true,
    errorTitle: "SKU",
    error:
      "SKU unique hona chahiye, max 60 letters. Space, underscore (_) ya slash (/) mat lagayein.",
    showInputMessage: true,
    promptTitle: "SKU",
    prompt: "Photo isi naam se upload hogi. e.g. LED-9W-CW",
  });

  forColumn("mainCategory", {
    type: "list",
    allowBlank: true,
    formulae: ["=MainCategories"],
    showErrorMessage: true,
    errorTitle: "Main Category",
    error: "List se category choose karein.",
  });

  forColumn("subCategory", {
    type: "list",
    allowBlank: true,
    formulae: [`=INDIRECT(VLOOKUP($C${FIRST_DATA_ROW},MainMap,2,FALSE))`],
    showErrorMessage: true,
    errorTitle: "Sub Category",
    error: "Pehle Main Category choose karein, phir list se Sub Category.",
  });

  forColumn("price", {
    type: "decimal",
    operator: "greaterThanOrEqual",
    allowBlank: true,
    formulae: [0],
    showErrorMessage: true,
    errorTitle: "Price",
    error: "Sirf number likhein (₹ ya comma nahi). Example: 85",
  });

  // N(E2) rather than E2 so a blank Price does not make this fail: a Max Price
  // with no Price is unusual but not wrong, and the server treats it as a
  // range starting at "ask".
  forColumn("priceMax", {
    type: "custom",
    allowBlank: true,
    formulae: [`=AND(ISNUMBER(F${FIRST_DATA_ROW}),F${FIRST_DATA_ROW}>=N(E${FIRST_DATA_ROW}))`],
    showErrorMessage: true,
    errorTitle: "Max Price",
    error: "Max Price ek number ho aur Price se kam na ho.",
  });

  // Warning, not a refusal: the list covers the common units, and a seller
  // selling by the truckload must still be able to say so.
  forColumn("unit", {
    type: "list",
    allowBlank: true,
    formulae: ["=Units"],
    showErrorMessage: true,
    errorStyle: "warning",
    errorTitle: "Unit",
    error: "Ye unit list mein nahi hai. Phir bhi rakhna hai to 'Yes' dabayein.",
  });

  forColumn("minOrderQty", {
    type: "whole",
    operator: "between",
    allowBlank: true,
    formulae: [1, 9_999_999],
    showErrorMessage: true,
    errorTitle: "Min Order Qty",
    error: "Whole number likhein, jaise 100.",
  });

  // The remaining text columns differ only in their cap, so they are generated
  // rather than written out five times.
  const lengthCapped: Array<[key: string, title: string, max: number]> = [
    ["brand", "Brand", 100],
    ["modelNumber", "Model", 60],
    ["shortDescription", "Short Description", 300],
    ["description", "Full Description", 5000],
  ];

  for (const [key, title, max] of lengthCapped) {
    forColumn(key, {
      type: "textLength",
      operator: "lessThanOrEqual",
      allowBlank: true,
      formulae: [max],
      showErrorMessage: true,
      errorTitle: title,
      error: `Max ${max} letters.`,
    });
  }
}

// ═════════════════════════════ Categories ════════════════════════════════════

function writeCategoriesSheet(
  workbook: ExcelJS.Workbook,
  categories: readonly TemplateCategory[],
): void {
  const sheet = workbook.addWorksheet(SHEET_NAMES.categories);
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  sheet.getColumn(1).width = 38;
  sheet.getColumn(2).width = 40;
  sheet.getColumn(3).width = 80;

  const header = sheet.getRow(1);
  ["Main Category", "Sub Category", "Full Path"].forEach((text, index) => {
    const cell = header.getCell(index + 1);
    cell.value = text;
    cell.font = { name: "Arial", size: 11, bold: true, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
  });

  categories.forEach((category, index) => {
    const row = sheet.getRow(index + 2);

    const main = row.getCell(1);
    main.value = category.main;
    main.font = { name: "Arial", size: 10 };

    const sub = row.getCell(2);
    sub.value = category.sub;
    sub.font = { name: "Arial", size: 10 };

    // The full path is the column that answers "is this the right one?" when
    // two branches both have a "Fittings" leaf.
    const path = row.getCell(3);
    path.value = category.fullPath;
    path.font = { name: "Arial", size: 10, color: { argb: MUTED } };
  });

  // Searching 358 rows without a filter is hopeless on a laptop.
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: categories.length + 1, column: 3 } };
}

// ═══════════════════════════ Lists (hidden) ══════════════════════════════════

/** Main names and range names start here; the per-main columns start at F. */
const LISTS_UNITS_COLUMN = 4;
const LISTS_FIRST_SUB_COLUMN = 6;

function writeListsSheet(workbook: ExcelJS.Workbook, grouped: Grouped): void {
  const sheet = workbook.addWorksheet(SHEET_NAMES.lists);
  // Hidden, not deleted: Excel resolves the named ranges out of it, and a
  // seller who sees a sheet of raw lists starts wondering whether to fill it.
  sheet.state = "hidden";

  sheet.getCell(1, 1).value = "Main";
  sheet.getCell(1, 2).value = "RangeName";
  sheet.getCell(1, LISTS_UNITS_COLUMN).value = "Units";

  // A, B: main name → the name of the range holding its sub-categories. This
  // pair is the MainMap that VLOOKUP reads.
  grouped.forEach((group, index) => {
    sheet.getCell(index + 2, 1).value = group.main;
    sheet.getCell(index + 2, 2).value = rangeNameFor(index);
  });

  UNIT_OPTIONS.forEach((unit, index) => {
    sheet.getCell(index + 2, LISTS_UNITS_COLUMN).value = unit;
  });

  // F onward: one column per main category, its leaves down the rows.
  grouped.forEach((group, index) => {
    const column = LISTS_FIRST_SUB_COLUMN + index;
    sheet.getCell(1, column).value = group.main;
    group.subs.forEach((sub, subIndex) => {
      sheet.getCell(subIndex + 2, column).value = sub;
    });
  });
}

/**
 * `sub_1`, `sub_2`, … — the defined name holding one main's leaves.
 *
 * Positional rather than derived from the category name, because a defined
 * name may not contain spaces, "&" or most punctuation, and "Textiles, Yarn &
 * Fabrics" would need mangling that could collide with another category's.
 */
function rangeNameFor(index: number): string {
  return `sub_${index + 1}`;
}

function addDefinedNames(workbook: ExcelJS.Workbook, grouped: Grouped): void {
  const lists = SHEET_NAMES.lists;
  const lastMainRow = grouped.length + 1;

  // Quoted because the sheet name is a bare word today but need not stay one.
  const ref = (range: string) => `'${lists}'!${range}`;

  workbook.definedNames.add(ref(`$A$2:$A$${lastMainRow}`), "MainCategories");
  workbook.definedNames.add(ref(`$A$2:$B$${lastMainRow}`), "MainMap");
  workbook.definedNames.add(
    ref(`$${columnLetter(LISTS_UNITS_COLUMN)}$2:$${columnLetter(LISTS_UNITS_COLUMN)}$${UNIT_OPTIONS.length + 1}`),
    "Units",
  );

  grouped.forEach((group, index) => {
    const letter = columnLetter(LISTS_FIRST_SUB_COLUMN + index);
    // A main with no leaves would produce `$F$2:$F$1`, which Excel rejects —
    // so an empty branch gets a single-cell range instead of a broken file.
    const lastRow = Math.max(2, group.subs.length + 1);
    workbook.definedNames.add(ref(`$${letter}$2:$${letter}$${lastRow}`), rangeNameFor(index));
  });
}

export { columnLetter };
