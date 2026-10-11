import { redirect } from "next/navigation";
import { requireSeller } from "@/lib/auth/guards";
import { checkRateLimit } from "@/lib/ratelimit";
import { readProductRows, MAX_UPLOAD_BYTES } from "@/lib/import/read-workbook";
import { parseProductGrid } from "@/lib/import/parse";
import { stageBatch } from "@/lib/import/store";
import { getTemplateTaxonomy } from "@/server/services/import-template.service";
import {
  createImportJob,
  getExistingSkus,
  getRemainingProductSlots,
} from "@/server/services/import.service";

/**
 * Receive the spreadsheet, parse it, and redirect to the preview (D49).
 *
 * ── Why a route handler and not a Server Action ────────────────────────────
 * Server Actions are capped at 2 MB of request body by `next.config.ts`, and
 * the documented upload limit here is 5 MB. Raising the global cap to suit one
 * form would raise it for every action in the application, including the
 * public enquiry form. A route handler has no such cap, and a plain
 * `<form method="post" enctype="multipart/form-data">` posts to it with no
 * JavaScript at all — which the rest of this dashboard also manages.
 *
 * ── The file is never written to disk ──────────────────────────────────────
 * It is parsed from memory and the ROWS are kept (in Redis, see
 * lib/import/store); the bytes are discarded as soon as this handler returns.
 * There is nothing to clean up and nothing to leak, and the seller's file
 * never exists anywhere we would have to protect it.
 */

export const runtime = "nodejs";

/** Everything is reported back on the import page, as a query parameter. */
function back(problem: string, detail?: string): never {
  const params = new URLSearchParams({ problem });
  if (detail) params.set("detail", detail);
  redirect(`/dashboard/products/import?${params.toString()}`);
}

export async function POST(request: Request): Promise<Response> {
  const scope = await requireSeller();

  // Parsing a thousand-row workbook is real work, and it happens before
  // anything is written — so the limit is on the PARSE, not on the import.
  // Per seller rather than per IP: a trader's whole market shares one
  // connection, and one of them re-uploading should not lock out the others.
  const limit = await checkRateLimit("upload", `import:${scope.sellerId}`);
  if (!limit.success) {
    back("rate_limited");
  }

  const form = await request.formData().catch(() => null);
  if (!form) back("unreadable");

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) back("no_file");

  if (file.size > MAX_UPLOAD_BYTES) {
    back("too_large", String(file.size));
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  // The extension decides which reader to use, and the magic bytes then decide
  // whether to believe it — `readProductRows` refuses anything that claims to
  // be .xlsx but is not a ZIP.
  const isCsv = /\.csv$/i.test(file.name);

  const read = await readProductRows(bytes, { csv: isCsv });

  if (!read.ok) {
    const { failure } = read;
    if (failure.kind === "no_products_sheet") back("no_products_sheet", failure.found.join(", "));
    if (failure.kind === "too_large") back("too_large", String(failure.bytes));
    if (failure.kind === "not_a_spreadsheet") back("not_a_spreadsheet");
    back("unreadable", failure.kind === "unreadable" ? failure.detail : undefined);
  }

  const [{ lookup }, existingSkus, slots] = await Promise.all([
    getTemplateTaxonomy(),
    getExistingSkus(scope.sellerId),
    getRemainingProductSlots(scope.sellerId),
  ]);

  const parsed = parseProductGrid({
    grid: read.rows,
    categories: lookup,
    existingSkus,
    remainingProductSlots: slots.remaining,
  });

  if (!parsed.ok) {
    const { problem } = parsed;
    if (problem.kind === "missing_columns") back("missing_columns", problem.columns.join(", "));
    if (problem.kind === "too_many_rows") back("too_many_rows", String(problem.rows));
    back("no_rows");
  }

  // The job row exists from the preview onward, so a seller who looks at a
  // preview and walks away still has a record of having tried. It also carries
  // the double-submit guard (see `runImport`).
  const jobId = await createImportJob({
    sellerId: scope.sellerId,
    fileName: file.name,
    fileSize: file.size,
    totalRows: parsed.counts.total,
    errorRows: parsed.counts.error,
    skippedRows: parsed.counts.overLimit,
    issues: parsed.rows.flatMap((row) => row.issues),
  });

  const batch = await stageBatch({
    sellerId: scope.sellerId,
    jobId,
    fileName: file.name,
    fileSize: file.size,
    rows: parsed.rows,
    counts: parsed.counts,
  });

  redirect(`/dashboard/products/import?batch=${batch.id}`);
}
