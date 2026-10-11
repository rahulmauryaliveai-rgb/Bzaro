import { requireSeller } from "@/lib/auth/guards";
import { readBatch } from "@/lib/import/store";
import { buildErrorReport, errorReportFileName } from "@/lib/import/error-report";

/**
 * "Download error report" (D49).
 *
 * Built from the STAGED batch, not from the ImportJob row: the job stores only
 * the first fifty problems (see `issuesForStorage`), while the report is meant
 * to be the seller's working copy of every row that needs fixing. Once the
 * batch has expired there is nothing to rebuild it from, and the link is no
 * longer offered.
 */

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const scope = await requireSeller();

  const batchId = new URL(request.url).searchParams.get("batch") ?? "";

  // Scoped by seller inside `readBatch`, so another seller's batch id reads as
  // simply not there.
  const batch = await readBatch(scope.sellerId, batchId);

  if (!batch) {
    return new Response("That upload has expired. Upload the file again.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const report = await buildErrorReport({ rows: batch.rows, fileName: batch.fileName });
  const fileName = errorReportFileName(batch.fileName);

  return new Response(new Uint8Array(report), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Length": String(report.byteLength),
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}
