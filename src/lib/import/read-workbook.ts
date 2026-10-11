import ExcelJS from "exceljs";
import JSZip from "jszip";
import { SHEET_NAMES } from "@/lib/import/columns";

/**
 * Turning an uploaded file into a grid of strings (D49).
 *
 * Deliberately separate from validation (`parse.ts`): reading is where the
 * file format's problems live, validating is where the catalogue's rules live,
 * and keeping them apart means the row rules are testable from a literal array
 * with no workbook in sight.
 *
 * ── Values, never formulas ──────────────────────────────────────────────────
 * A seller who computes a price with `=B2*1.18` must get 118, not the text
 * "B2*1.18". Excel caches the last computed result alongside the formula, and
 * `cellText` reads that cache. A file written by a tool that stores formulas
 * WITHOUT a cached result (openpyxl does this unless told otherwise) therefore
 * has no value to read, which surfaces to the seller as an empty cell — the
 * honest outcome, since we do not evaluate spreadsheet formulas.
 */

/** 5 MB. Bigger than any 1000-row product sheet; small enough to parse inline. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * .xlsx is a ZIP; every one starts "PK\x03\x04".
 *
 * Checked because the extension is a claim by the client, and handing a
 * renamed .exe to a ZIP parser is how a parser becomes an attack surface. A
 * .xls (the pre-2007 binary format) also fails this, which is the right
 * outcome — exceljs cannot read it, and "save as .xlsx" is a better message
 * than a stack trace.
 */
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

export type ReadFailure =
  | { kind: "too_large"; bytes: number; max: number }
  | { kind: "not_a_spreadsheet" }
  | { kind: "unreadable"; detail: string }
  | { kind: "no_products_sheet"; found: string[] };

export type ReadResult =
  | { ok: true; rows: string[][] }
  | { ok: false; failure: ReadFailure };

export function looksLikeZip(bytes: Uint8Array): boolean {
  return ZIP_MAGIC.every((byte, index) => bytes[index] === byte);
}

/**
 * Read the Products sheet out of an uploaded file.
 *
 * Returns a dense grid of trimmed strings: row 0 is the header row as it
 * arrived. Everything downstream works on strings, because a spreadsheet cell
 * has no reliable type — the same column arrives as a number in one seller's
 * file and text in the next, and converting once here means the row rules have
 * exactly one shape to handle.
 */
export async function readProductRows(
  file: Uint8Array,
  options: { csv?: boolean } = {},
): Promise<ReadResult> {
  if (file.byteLength > MAX_UPLOAD_BYTES) {
    return { ok: false, failure: { kind: "too_large", bytes: file.byteLength, max: MAX_UPLOAD_BYTES } };
  }

  if (options.csv) return readCsv(file);

  if (!looksLikeZip(file)) return { ok: false, failure: { kind: "not_a_spreadsheet" } };

  let workbook: ExcelJS.Workbook;

  try {
    const sanitised = await withoutCommentParts(file);
    workbook = new ExcelJS.Workbook();
    // The cast is exceljs's typings, not a shortcut: its index.d.ts declares
    // `interface Buffer extends ArrayBuffer {}` at global scope, which MERGES
    // with Node's own Buffer. The merged type then demands the members of both
    // and nothing real satisfies it. At runtime `load` hands the value to
    // JSZip, which takes a Uint8Array.
    type LoadInput = Parameters<typeof workbook.xlsx.load>[0];
    await workbook.xlsx.load(sanitised as unknown as LoadInput);
  } catch (error) {
    return {
      ok: false,
      failure: { kind: "unreadable", detail: error instanceof Error ? error.message : "unknown" },
    };
  }

  const sheet = findProductsSheet(workbook);

  if (!sheet) {
    return {
      ok: false,
      failure: {
        kind: "no_products_sheet",
        found: workbook.worksheets.map((worksheet) => worksheet.name),
      },
    };
  }

  return { ok: true, rows: gridFrom(sheet) };
}

/**
 * The Products sheet, by name — then, failing that, by shape.
 *
 * Name first because "do not rename the sheets" is the documented rule and a
 * renamed sheet is usually a renamed COPY sitting next to the original. The
 * fallback exists because a seller whose Excel is set to Hindi gets
 * "Products" translated on save, and refusing a file whose single sheet
 * plainly holds the right columns would be pedantry.
 */
function findProductsSheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet | null {
  const byName = workbook.worksheets.find(
    (sheet) => sheet.name.trim().toLowerCase() === SHEET_NAMES.products.toLowerCase(),
  );
  if (byName) return byName;

  // Never the template's own supporting sheets: "Categories" has a
  // "Main Category" header and would otherwise look like a candidate.
  const supporting = new Set<string>([
    SHEET_NAMES.howTo.toLowerCase(),
    SHEET_NAMES.categories.toLowerCase(),
    SHEET_NAMES.lists.toLowerCase(),
  ]);

  const candidates = workbook.worksheets.filter(
    (sheet) => sheet.state !== "hidden" && !supporting.has(sheet.name.trim().toLowerCase()),
  );

  return candidates.length === 1 ? candidates[0]! : null;
}

/** A worksheet as a dense grid of trimmed strings. */
function gridFrom(sheet: ExcelJS.Worksheet): string[][] {
  const width = Math.max(sheet.columnCount, 1);
  const rows: string[][] = [];

  // `rowCount` spans the styled-but-empty block the template writes down to
  // row 1001, so trailing blank rows are dropped below rather than parsed.
  for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const cells: string[] = [];

    for (let column = 1; column <= width; column += 1) {
      cells.push(cellText(row.getCell(column)));
    }

    rows.push(cells);
  }

  while (rows.length > 0 && rows[rows.length - 1]!.every((cell) => cell === "")) rows.pop();

  return rows;
}

/**
 * One cell as text.
 *
 * Every shape exceljs can hand back is spelled out, because the fallback for
 * an unhandled one is `String(object)` — "[object Object]" written into a
 * product name, which validates fine and is visible to buyers.
 */
function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value;

  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return numberText(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) return value.toISOString().slice(0, 10);

  if (typeof value === "object") {
    // A formula cell: take the cached result, never the formula text.
    if ("result" in value) {
      const result = (value as ExcelJS.CellFormulaValue).result;
      if (result === null || result === undefined) return "";
      if (typeof result === "number") return numberText(result);
      if (typeof result === "string") return result.trim();
      if (result instanceof Date) return result.toISOString().slice(0, 10);
      // An error result (#REF!, #VALUE!) is not a value. Blank, so the row
      // fails on "required" rather than importing the word "#REF!".
      return "";
    }

    // Rich text: a cell the seller part-bolded. Concatenating the runs gives
    // back what they see.
    if ("richText" in value) {
      return (value as ExcelJS.CellRichTextValue).richText
        .map((run) => run.text)
        .join("")
        .trim();
    }

    if ("text" in value) return String((value as ExcelJS.CellHyperlinkValue).text ?? "").trim();
    if ("error" in value) return "";
    if ("sharedFormula" in value) return "";
  }

  return "";
}

/**
 * A number as the seller would have typed it.
 *
 * Not `toLocaleString`: grouping separators would then have to be stripped
 * again downstream. Float noise is trimmed — a price typed as 4.5 can come
 * back as 4.500000000000001 after a round trip through Excel's storage, and
 * that is not a price anyone meant.
 */
function numberText(value: number): string {
  if (!Number.isFinite(value)) return "";
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(6)));
}

// ── CSV ─────────────────────────────────────────────────────────────────────

/**
 * Minimal RFC 4180 reader.
 *
 * Hand-rolled rather than pulled in: the file is one sheet of product rows, and
 * the only subtleties that matter are quoted fields containing commas or
 * newlines (every Full Description has one) and a BOM, which Excel always
 * writes and which would otherwise become part of the first header's text and
 * break column matching.
 */
function readCsv(file: Uint8Array): ReadResult {
  let text = new TextDecoder("utf-8").decode(file);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  const endField = () => {
    row.push(field.trim());
    field = "";
  };

  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;

    if (quoted) {
      if (char !== '"') {
        field += char;
        continue;
      }
      // "" inside a quoted field is one literal quote.
      if (text[index + 1] === '"') {
        field += '"';
        index += 1;
        continue;
      }
      quoted = false;
      continue;
    }

    if (char === '"') {
      quoted = true;
      continue;
    }

    if (char === ",") {
      endField();
      continue;
    }

    if (char === "\r") continue;

    if (char === "\n") {
      endRow();
      continue;
    }

    field += char;
  }

  // A file not ending in a newline still has a last row.
  if (field !== "" || row.length > 0) endRow();

  while (rows.length > 0 && rows[rows.length - 1]!.every((cell) => cell === "")) rows.pop();

  if (rows.length === 0) return { ok: false, failure: { kind: "unreadable", detail: "empty file" } };

  return { ok: true, rows };
}

// ── openpyxl tolerance ──────────────────────────────────────────────────────

/**
 * Strip cell comments from the package before exceljs reads it.
 *
 * ── Why this is necessary ───────────────────────────────────────────────────
 * exceljs locates comment parts by its OWN writing convention — the part at
 * `xl/comments1.xml`, referenced relatively as `../comments1.xml`. openpyxl
 * writes them to `xl/comments/comment1.xml` and references them absolutely, so
 * exceljs finds no entry for the relationship and dereferences `undefined`.
 * The result is a hard TypeError, not a degraded read.
 *
 * That matters here far beyond our own template: openpyxl is the most common
 * way a spreadsheet gets generated by a program, so some share of the files
 * sellers upload — exports from a shop's existing software — would crash the
 * importer with no explanation. Our own generated template contains header
 * notes too, so a round trip through any such tool hits it.
 *
 * Comments are PURE DOCUMENTATION: nothing downstream reads a note, so
 * dropping them loses nothing and makes the read work regardless of which tool
 * produced the file. The upload is a copy, so the seller's own file is
 * untouched.
 */
async function withoutCommentParts(file: Uint8Array): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(file);

  const paths = Object.keys(zip.files);
  const isCommentPart = (path: string) =>
    /(^|\/)comments?\d*\.xml$/i.test(path) || /\.vml$/i.test(path);

  if (!paths.some(isCommentPart)) return file;

  for (const path of paths) if (isCommentPart(path)) zip.remove(path);

  // A relationship or content-type pointing at a part that is now gone makes
  // the package invalid, so the references go with it.
  for (const path of paths) {
    const file = zip.file(path);
    if (!file) continue;

    if (/_rels\/.*\.rels$/i.test(path)) {
      const xml = await file.async("string");
      zip.file(
        path,
        xml.replace(/<Relationship\b[^>]*?(?:comments|vmlDrawing)[^>]*?\/>/gi, ""),
      );
      continue;
    }

    if (path === "[Content_Types].xml") {
      const xml = await file.async("string");
      zip.file(
        path,
        xml
          .replace(/<Override\b[^>]*?comments[^>]*?\/>/gi, "")
          .replace(/<Default\b[^>]*?vmlDrawing[^>]*?\/>/gi, ""),
      );
      continue;
    }

    // `legacyDrawing` is the sheet's pointer at the comment shapes.
    if (/^xl\/worksheets\/sheet[^/]*\.xml$/i.test(path)) {
      const xml = await file.async("string");
      zip.file(path, xml.replace(/<legacyDrawing\b[^>]*?\/>/gi, ""));
    }
  }

  return zip.generateAsync({ type: "uint8array" });
}
