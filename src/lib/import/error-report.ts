import ExcelJS from "exceljs";
import { IMPORT_COLUMNS } from "@/lib/import/columns";
import type { ParsedRow } from "@/lib/import/parse";

/**
 * "Download error report" (D49).
 *
 * ── Why it is the seller's own rows, not a list of errors ───────────────────
 * A list of error messages is something to read. A spreadsheet of the rows
 * that failed, with their original cells intact and the reasons in a column on
 * the right, is something to WORK IN: fix the red cells, delete nothing, save,
 * upload again. The seller never has to find row 437 in a thousand-row file.
 *
 * Only the problem rows are included — the ones that imported are already in
 * the catalogue, and re-uploading them would be a no-op at best and a
 * confusing double-entry at worst. Rows skipped for the plan limit are
 * included too: they are rows the seller still has to do something about, even
 * if the something is upgrading.
 */

const BRAND = "FF0B4A99";
const PROBLEM = "FFB42318";
const PROBLEM_TINT = "FFFEF3F2";

export async function buildErrorReport(input: {
  rows: readonly ParsedRow[];
  fileName: string;
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Bzaro";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Rows to fix");
  sheet.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }];

  // Row number first: it is how the seller finds the row in their own file.
  const columns = [
    { header: "Row", width: 7 },
    ...IMPORT_COLUMNS.map((column) => ({ header: column.header, width: column.width })),
    // Last, and wide: the reason is what they came here to read.
    { header: "Errors", width: 70 },
  ];

  const header = sheet.getRow(1);
  header.height = 30;

  columns.forEach((column, index) => {
    const cell = header.getCell(index + 1);
    cell.value = column.header;
    cell.font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      // The Errors column is red, so it is obviously not part of the data the
      // seller should re-upload.
      fgColor: { argb: index === columns.length - 1 ? PROBLEM : BRAND },
    };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    sheet.getColumn(index + 1).width = column.width;
  });

  const problems = input.rows.filter(
    (row) => row.status === "error" || row.status === "over_limit",
  );

  problems.forEach((row, index) => {
    const target = sheet.getRow(index + 2);

    const rowNumber = target.getCell(1);
    rowNumber.value = row.row;
    rowNumber.font = { name: "Arial", size: 10, bold: true };

    // The cells exactly as they arrived, NOT the parsed values: the seller is
    // going to edit this and send it back, and showing them a normalised
    // version of what they typed would hide the thing that is wrong with it.
    IMPORT_COLUMNS.forEach((column, columnIndex) => {
      const cell = target.getCell(columnIndex + 2);
      cell.value = row.cells[column.key] || null;
      cell.font = { name: "Arial", size: 10 };
      cell.alignment = { vertical: "top", wrapText: column.format === "wrap" };
    });

    const errors = target.getCell(columns.length);
    // Column named in each line, because the row is right there but which of
    // fourteen cells is wrong is not obvious.
    errors.value = row.issues
      .map((issue) => (issue.column ? `${issue.column}: ${issue.message}` : issue.message))
      .join("\n");
    errors.font = { name: "Arial", size: 10, color: { argb: PROBLEM } };
    errors.alignment = { vertical: "top", wrapText: true };
    errors.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PROBLEM_TINT } };
  });

  if (problems.length === 0) {
    const cell = sheet.getCell(2, 2);
    cell.value = "Nothing to fix — every row in this file was fine.";
    cell.font = { name: "Arial", size: 11, italic: true };
  }

  const written = await workbook.xlsx.writeBuffer();
  return Buffer.from(written as ArrayBuffer);
}

/**
 * A safe download name derived from what the seller uploaded.
 *
 * Their own file name is the thing that makes the download recognisable among
 * five others in a Downloads folder — but it reaches us from the client, so
 * every path separator, control character and quote is stripped before it goes
 * anywhere near a Content-Disposition header.
 */
export function errorReportFileName(uploaded: string): string {
  const base = uploaded
    .replace(/\.(xlsx|xlsm|csv)$/i, "")
    .replace(/[^\p{L}\p{N} _.-]/gu, "")
    .trim()
    .slice(0, 80);

  return `${base || "Bzaro_Products"}_errors.xlsx`;
}
