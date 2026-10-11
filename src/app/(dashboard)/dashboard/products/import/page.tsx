import type { Metadata } from "next";
import Link from "next/link";
import { requireSeller } from "@/lib/auth/guards";
import { ImportSteps } from "@/components/dashboard/ImportSteps";
import { ImportPreview } from "@/components/dashboard/ImportPreview";
import { DownloadLink } from "@/components/dashboard/DownloadLink";
import { readBatch } from "@/lib/import/store";
import { MAX_UPLOAD_BYTES } from "@/lib/import/read-workbook";
import { MAX_IMPORT_ROWS } from "@/lib/import/columns";
import {
  getRemainingProductSlots,
  listRecentImports,
} from "@/server/services/import.service";

export const metadata: Metadata = {
  title: "Bulk upload",
  robots: { index: false, follow: false },
};

/**
 * Step 1 (upload) and step 2 (check), on one page (D49).
 *
 * One route rather than two because they are one task: a seller who uploads a
 * file and is bounced to a different URL for the preview has lost the thread,
 * and a back button then re-posts the file. The `batch` parameter decides
 * which half is shown.
 *
 * The upload posts to a route handler, not a Server Action — actions are
 * capped at 2 MB of body and the documented limit here is 5 MB. See
 * `import/upload/route.ts`.
 */

/** Everything the upload route can refuse, in words a seller can act on. */
function problemMessage(problem: string, detail: string | undefined): string {
  switch (problem) {
    case "no_file":
      return "Choose a file first.";
    case "too_large": {
      const size = detail ? Number(detail) : 0;
      const mb = size ? (size / (1024 * 1024)).toFixed(1) : "?";
      return `That file is ${mb} MB. The limit is ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB — split it into two files.`;
    }
    case "not_a_spreadsheet":
      return "That is not an Excel file. Open it in Excel and use File → Save As → .xlsx, then try again.";
    case "no_products_sheet":
      return detail
        ? `No sheet called "Products" in that file. It has: ${detail}. Please use the Bzaro template.`
        : 'No sheet called "Products" in that file. Please use the Bzaro template.';
    case "missing_columns":
      return `That file is missing a column: ${detail ?? "unknown"}. Download the template and copy your data into it.`;
    case "too_many_rows":
      return `That file has ${detail ?? "too many"} products. Up to ${MAX_IMPORT_ROWS} per file — please split it.`;
    case "no_rows":
      return "There are no products in that file. Fill in the Products sheet and try again.";
    case "rate_limited":
      return "You have uploaded a lot of files just now. Please wait a few minutes and try again.";
    default:
      return "That file could not be read. Please use the Bzaro template, or send it to us and we will look.";
  }
}

export default async function ImportPage({
  searchParams,
}: {
  // A Promise in Next 16 — see node_modules/next/dist/docs on page props.
  searchParams: Promise<{ batch?: string; problem?: string; detail?: string }>;
}) {
  const scope = await requireSeller();
  const params = await searchParams;

  const [slots, recent] = await Promise.all([
    getRemainingProductSlots(scope.sellerId),
    listRecentImports(scope.sellerId),
  ]);

  const batch = params.batch ? await readBatch(scope.sellerId, params.batch) : null;

  // A batch id that no longer resolves is almost always an expired preview or
  // a bookmarked URL, not an attack — so it is explained, not refused.
  const expired = Boolean(params.batch) && !batch;

  return (
    <div className="max-w-4xl">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Bulk upload</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Add many products at once with an Excel file, then add photos by SKU.
        </p>
      </header>

      <ImportSteps current={batch ? 2 : 1} />

      {params.problem ? (
        <p role="alert" className="mb-5 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {problemMessage(params.problem, params.detail)}
        </p>
      ) : null}

      {expired ? (
        <p role="alert" className="mb-5 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          That upload has expired — we keep a file ready for 30 minutes. Nothing was saved. Please
          upload it again.
        </p>
      ) : null}

      {batch ? (
        <ImportPreview
          batchId={batch.id}
          fileName={batch.fileName}
          counts={batch.counts}
          rows={batch.rows.map((row) => ({
            row: row.row,
            status: row.status,
            name: row.name,
            sku: row.sku,
            categoryPath: row.categoryPath,
            issues: row.issues,
          }))}
          plan={{ name: slots.planName, limit: slots.limit, used: slots.used }}
        />
      ) : (
        <UploadStep remaining={slots.remaining} planName={slots.planName} />
      )}

      {recent.length > 0 && !batch ? <RecentImports imports={recent} /> : null}
    </div>
  );
}

function UploadStep({ remaining, planName }: { remaining: number; planName: string }) {
  return (
    <div className="space-y-5">
      {/* ── Get the template ── */}
      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="font-medium">1. Download the Excel file</h2>
        <p className="mt-1 text-sm text-neutral-600">
          The template already has your categories in a dropdown, so you do not have to type them.
        </p>

        <div className="mt-4 flex flex-wrap gap-3">
          <DownloadLink href="/dashboard/products/import/template" variant="primary">
            Download template
          </DownloadLink>
          <DownloadLink href="/dashboard/products/import/template?demo=1">
            Download demo (10 filled examples)
          </DownloadLink>
        </div>

        <ul className="mt-4 space-y-1 text-sm text-neutral-600">
          <li>• One row = one product. Columns marked * are required.</li>
          <li>
            • Give every product its own <span className="font-medium">SKU</span> — letters, numbers
            and hyphen (-). Photos are matched by this code.
          </li>
          <li>• Leave the price blank for &ldquo;Ask for Price&rdquo;.</li>
          <li>• Up to {MAX_IMPORT_ROWS} products per file.</li>
        </ul>
      </section>

      {/* ── Upload it ── */}
      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="font-medium">2. Upload your filled file</h2>
        <p className="mt-1 text-sm text-neutral-600">
          We will show you what will happen before anything is saved.
        </p>

        {/*
          A plain multipart form posting to a route handler: no JavaScript
          needed, like the rest of this dashboard. `required` means the browser
          catches an empty submit before the request is made.
        */}
        <form
          action="/dashboard/products/import/upload"
          method="post"
          encType="multipart/form-data"
          className="mt-4 space-y-3"
        >
          <input
            type="file"
            name="file"
            required
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-neutral-300 file:bg-white file:px-3 file:py-1.5 file:text-sm"
          />

          <button
            type="submit"
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Upload and check
          </button>

          <p className="text-xs text-neutral-500">
            .xlsx or .csv, up to {MAX_UPLOAD_BYTES / (1024 * 1024)} MB.
          </p>
        </form>
      </section>

      {remaining <= 10 ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Your {planName} plan has room for {remaining} more product{remaining === 1 ? "" : "s"}.{" "}
          <Link href="/dashboard/billing" className="underline underline-offset-2">
            See plans
          </Link>
        </p>
      ) : null}
    </div>
  );
}

type RecentImport = Awaited<ReturnType<typeof listRecentImports>>[number];

/**
 * The last ten imports.
 *
 * A bulk write is the one catalogue operation whose result a seller cannot
 * check by looking: forty products appeared and three did not, and without
 * this there is no way to know that happened at all.
 */
function RecentImports({ imports }: { imports: RecentImport[] }) {
  const STATUS: Record<string, { label: string; classes: string }> = {
    PENDING: { label: "Not imported", classes: "bg-neutral-100 text-neutral-600" },
    RUNNING: { label: "Importing…", classes: "bg-blue-50 text-blue-800" },
    COMPLETED: { label: "Done", classes: "bg-teal-50 text-teal-800" },
    PARTIAL: { label: "Partly done", classes: "bg-amber-50 text-amber-900" },
    FAILED: { label: "Failed", classes: "bg-red-50 text-red-700" },
  };

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-neutral-500 uppercase">
        Recent uploads
      </h2>

      <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
        {imports.map((job) => {
          const status = STATUS[job.status] ?? STATUS.PENDING!;

          return (
            <li key={job.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{job.fileName}</span>

              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${status.classes}`}
              >
                {status.label}
              </span>

              <span className="w-full text-xs text-neutral-500 sm:w-auto">
                {job.createdRows} added · {job.updatedRows} updated
                {job.errorRows > 0 ? ` · ${job.errorRows} errors` : ""}
                {job.skippedRows > 0 ? ` · ${job.skippedRows} skipped` : ""} ·{" "}
                {job.createdAt.toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
