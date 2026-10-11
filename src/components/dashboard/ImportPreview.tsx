"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { commitImportAction, type ImportActionState } from "@/server/actions/import";
import { formatIssue, type ParsedRow } from "@/lib/import/parse";
import { DownloadLink } from "@/components/dashboard/DownloadLink";

/**
 * Step 2 — what the spreadsheet will do, before it does it (D49).
 *
 * ── The one thing this screen has to get across ───────────────────────────
 * Which rows are NEW and which will OVERWRITE something. A seller re-uploading
 * a corrected file expects updates; a seller who changed the SKU column by
 * accident is about to create forty duplicates. Both look identical on the
 * spreadsheet and completely different here, which is the entire reason this
 * step exists.
 *
 * Errors do not block the rest: the valid rows import, the broken ones come
 * back in a downloadable copy of the seller's own rows with the reasons
 * attached. Refusing the whole file over one bad price would mean a seller
 * with nine hundred good rows gets nothing.
 */

const INITIAL: ImportActionState = {};

type PreviewRow = Pick<ParsedRow, "row" | "status" | "name" | "sku" | "categoryPath" | "issues">;

export type ImportPreviewProps = {
  batchId: string;
  fileName: string;
  counts: { total: number; create: number; update: number; error: number; overLimit: number };
  rows: PreviewRow[];
  /** Shown with the upgrade banner when rows did not fit the plan. */
  plan: { name: string; limit: number; used: number };
};

function StatusBadge({ status }: { status: PreviewRow["status"] }) {
  const { label, classes } = {
    new: { label: "New", classes: "bg-teal-50 text-teal-800" },
    update: { label: "Update", classes: "bg-blue-50 text-blue-800" },
    error: { label: "Error", classes: "bg-red-50 text-red-700" },
    over_limit: { label: "Over plan limit", classes: "bg-amber-50 text-amber-900" },
  }[status];

  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${classes}`}
    >
      {label}
    </span>
  );
}

export function ImportPreview(props: ImportPreviewProps) {
  const { batchId, fileName, counts, rows, plan } = props;
  const [state, action, pending] = useActionState(commitImportAction, INITIAL);

  // Errors first by default: they are the rows the seller has to act on, and
  // scrolling past nine hundred fine rows to find three broken ones is not a
  // review, it is a search.
  const [onlyProblems, setOnlyProblems] = useState(counts.error + counts.overLimit > 0);

  const problems = rows.filter((row) => row.status === "error" || row.status === "over_limit");
  const shown = onlyProblems ? problems : rows;

  const importable = counts.create + counts.update;

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="font-medium">Check before saving</h2>
        <p className="mt-1 text-sm text-neutral-600">
          From <span className="font-medium">{fileName}</span>. Nothing has been saved yet.
        </p>

        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="New products" value={counts.create} tone="teal" />
          <Stat label="Will be updated" value={counts.update} tone="blue" />
          <Stat label="Rows with errors" value={counts.error} tone="red" />
          <Stat label="Over plan limit" value={counts.overLimit} tone="amber" />
        </dl>
      </div>

      {counts.update > 0 ? (
        <p className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-900">
          {counts.update} product{counts.update === 1 ? "" : "s"} already exist with the same SKU
          and will be updated. Only the columns you filled in will change — anything you left blank
          stays as it is, and photos are not touched.
        </p>
      ) : null}

      {counts.overLimit > 0 ? (
        <div className="rounded-md bg-amber-50 px-3 py-3 text-sm text-amber-900">
          <p className="font-medium">
            {counts.overLimit} product{counts.overLimit === 1 ? "" : "s"} will not be imported.
          </p>
          <p className="mt-1">
            Your {plan.name} plan allows {plan.limit} products and you already have {plan.used}. The
            rest of the file will import normally.
          </p>
          <Link
            href="/dashboard/billing"
            className="mt-2 inline-block rounded-md bg-amber-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800"
          >
            See plans
          </Link>
        </div>
      ) : null}

      {counts.error > 0 ? (
        <div className="rounded-md bg-red-50 px-3 py-3 text-sm text-red-800">
          <p className="font-medium">
            {counts.error} row{counts.error === 1 ? "" : "s"} could not be read.
          </p>
          <p className="mt-1">
            The other rows will still import. Download the report below, fix the red cells, and
            upload that file again.
          </p>
          <div className="mt-2">
            <DownloadLink
              href={`/dashboard/products/import/errors?batch=${batchId}`}
              variant="danger"
            >
              Download error report
            </DownloadLink>
          </div>
        </div>
      ) : null}

      {state.error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      {state.message ? (
        <p role="status" className="rounded-md bg-teal-50 px-3 py-2 text-sm text-teal-900">
          {state.message}
        </p>
      ) : null}

      {/* ── The rows ── */}
      <div className="rounded-lg border border-neutral-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 px-4 py-3">
          <h3 className="text-sm font-medium">
            {onlyProblems ? `${problems.length} rows to look at` : `All ${rows.length} rows`}
          </h3>

          {problems.length > 0 ? (
            <button
              type="button"
              onClick={() => setOnlyProblems((value) => !value)}
              className="text-xs text-neutral-700 underline underline-offset-2"
            >
              {onlyProblems ? "Show all rows" : "Show only problems"}
            </button>
          ) : null}
        </div>

        {/*
          A list, not a table. Fourteen columns do not fit on a phone, and a
          horizontally scrolling table is unusable with a thumb — so each row
          becomes a block with the number, the name and what will happen.
        */}
        <ul className="divide-y divide-neutral-200">
          {shown.slice(0, 200).map((row) => (
            <li key={row.row} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-neutral-500">Row {row.row}</span>
                <StatusBadge status={row.status} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {row.name || <span className="text-neutral-400">(no name)</span>}
                </span>
              </div>

              <p className="mt-0.5 text-xs text-neutral-500">
                {row.sku ? <span className="font-mono">{row.sku}</span> : "no SKU"}
                {row.categoryPath ? ` · ${row.categoryPath}` : ""}
              </p>

              {row.issues.length > 0 ? (
                <ul className="mt-1.5 space-y-0.5">
                  {row.issues.map((issue, index) => (
                    <li key={index} className="text-xs text-red-700">
                      {formatIssue(issue)}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>

        {shown.length > 200 ? (
          <p className="border-t border-neutral-200 px-4 py-3 text-xs text-neutral-500">
            Showing the first 200 of {shown.length} rows. All of them will be imported.
          </p>
        ) : null}
      </div>

      {/* ── Import ── */}
      <form action={action} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="batch" value={batchId} />

        <button
          type="submit"
          disabled={pending || importable === 0}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending
            ? "Importing…"
            : importable === 0
              ? "Nothing to import"
              : `Import ${importable} product${importable === 1 ? "" : "s"}`}
        </button>

        <Link
          href="/dashboard/products/import"
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
        >
          Upload a different file
        </Link>

        <p className="w-full text-xs text-neutral-500">
          Products are saved as drafts. You add photos next, then publish.
        </p>
      </form>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "teal" | "blue" | "red" | "amber";
}) {
  // Zero is deliberately grey whatever the tone: a red "0 errors" reads as a
  // warning at a glance, which is the opposite of what it says.
  const classes =
    value === 0
      ? "text-neutral-400"
      : { teal: "text-teal-700", blue: "text-blue-700", red: "text-red-700", amber: "text-amber-700" }[
          tone
        ];

  return (
    <div>
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className={`text-xl font-semibold ${classes}`}>{value}</dd>
    </div>
  );
}
