"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { confirmUploadAction, requestUploadAction } from "@/server/actions/media";
import {
  attachPhotoAction,
  clearProductPhotosAction,
  finishPhotoBatchAction,
  matchPhotosAction,
} from "@/server/actions/import-photos";
import { MAX_PHOTOS_PER_PRODUCT, type PhotoMatch, type PhotoTarget } from "@/lib/import/photo-names";

/**
 * Step 3 — photos in bulk, matched by SKU (D49).
 *
 * ── Match first, upload second ────────────────────────────────────────────
 * Choosing the files sends only their NAMES to the server, which answers with
 * what it would do. Nothing is uploaded until the seller has seen that and
 * pressed the button. On a phone connection in a market town, finding out
 * after fifty megabytes that every file was misnamed is the difference between
 * a mistake costing a moment and costing an afternoon.
 *
 * ── Three at a time ───────────────────────────────────────────────────────
 * Not one (five hundred photos sequentially is twenty minutes of waiting) and
 * not all at once (a phone browser caps parallel connections, the rest queue
 * invisibly, and progress stops meaning anything). Three keeps the connection
 * busy and the progress bar honest.
 *
 * ── Failures are retried, then reported ───────────────────────────────────
 * A dropped photo on a flaky connection is normal, not exceptional. Each file
 * gets two retries with a growing delay; what still fails is listed by name so
 * the seller can re-select those few rather than the whole batch.
 */

const CONCURRENCY = 3;
const MAX_ATTEMPTS = 3;

type Phase =
  | { kind: "choosing" }
  | { kind: "matching" }
  | { kind: "ready"; match: PhotoMatch }
  | { kind: "uploading"; done: number; total: number; current: string }
  | { kind: "finished"; uploaded: number; failed: Array<{ fileName: string; error: string }> };

type Mode = "add" | "replace";

export function BulkPhotoUpload({ products }: { products: PhotoTarget[] }) {
  const [phase, setPhase] = useState<Phase>({ kind: "choosing" });
  const [mode, setMode] = useState<Mode>("add");
  const [error, setError] = useState<string | null>(null);

  /**
   * The actual File objects, kept out of React state.
   *
   * State holds the plan; this holds the bytes. Putting five hundred File
   * objects in state would make every progress tick re-render a list of five
   * hundred items.
   */
  const filesRef = useRef<Map<string, File>>(new Map());

  /** Unmatched files the seller has assigned to a product by hand. */
  const [assigned, setAssigned] = useState<Map<string, string>>(new Map());

  const inputRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  async function choose(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;

    setError(null);
    setAssigned(new Map());
    setPhase({ kind: "matching" });

    const files = Array.from(fileList);
    const map = new Map<string, File>();
    // `webkitRelativePath` is set for a folder selection and is what lets a
    // seller drop a whole folder of photos in.
    for (const file of files) map.set(relativeName(file), file);
    filesRef.current = map;

    const result = await matchPhotosAction([...map.keys()], mode);

    if (!result.ok) {
      setError(result.error);
      setPhase({ kind: "choosing" });
      return;
    }

    setPhase({ kind: "ready", match: result.match });
  }

  /** Re-match without re-selecting, when the add/replace choice changes. */
  async function changeMode(next: Mode) {
    setMode(next);
    if (phase.kind !== "ready") return;

    const result = await matchPhotosAction([...filesRef.current.keys()], next);
    if (result.ok) setPhase({ kind: "ready", match: result.match });
  }

  async function upload() {
    if (phase.kind !== "ready") return;

    // Matched files, plus the ones the seller assigned by hand. Anything still
    // unassigned is left alone — an unrecognised file is not a file to guess
    // about.
    const queue: Array<{ fileName: string; productId: string; sortOrder: number }> = [];

    for (const group of phase.match.products) {
      // The 12-photo cap, enforced client-side so the seller is not told
      // "already full" twelve times. The server enforces it too, inside a
      // transaction, because this check cannot be trusted.
      const room = MAX_PHOTOS_PER_PRODUCT - group.existingCount;
      for (const file of group.files.slice(0, Math.max(0, room))) {
        queue.push({
          fileName: file.fileName,
          productId: file.productId,
          // Decided by the matcher, so concurrent uploads cannot fight over a
          // slot. See MatchedFile.sortOrder.
          sortOrder: file.sortOrder,
        });
      }
    }

    // Hand-assigned files land after whatever the matcher placed for that
    // product, rather than all claiming slot 0.
    const nextFree = new Map<string, number>();
    for (const item of queue) {
      nextFree.set(item.productId, Math.max(nextFree.get(item.productId) ?? 0, item.sortOrder + 1));
    }

    for (const [fileName, productId] of assigned) {
      if (!productId) continue;
      const slot = nextFree.get(productId) ?? existingCountFor(phase.match, productId);
      if (slot >= MAX_PHOTOS_PER_PRODUCT) continue;
      queue.push({ fileName, productId, sortOrder: slot });
      nextFree.set(productId, slot + 1);
    }

    if (queue.length === 0) {
      setError("Nothing to upload — none of these photos matched a product.");
      return;
    }

    setError(null);

    // ── Replace: clear everything first, once, before a single byte goes up ──
    // Not inside the attaches. Three run concurrently, so "clear on the first
    // one" raced the other two and deleted photos that had already landed —
    // and if that first attempt failed before attaching, nothing cleared at
    // all and Replace quietly behaved like Add.
    if (mode === "replace") {
      setPhase({ kind: "uploading", done: 0, total: queue.length, current: "Clearing old photos…" });

      const productIds = [...new Set(queue.map((item) => item.productId))];
      const cleared = await clearProductPhotosAction(productIds);

      if (!cleared.ok) {
        setError(cleared.error);
        setPhase({ kind: "ready", match: phase.match });
        return;
      }
    }

    setPhase({ kind: "uploading", done: 0, total: queue.length, current: queue[0]!.fileName });

    const failed: Array<{ fileName: string; error: string }> = [];
    let done = 0;
    let uploaded = 0;

    /** One worker, pulling from the shared queue. */
    const worker = async () => {
      for (;;) {
        const item = queue.shift();
        if (!item) return;

        const file = filesRef.current.get(item.fileName);

        if (!file) {
          failed.push({ fileName: item.fileName, error: "the file could not be read" });
        } else {
          const result = await uploadOne({
            file,
            productId: item.productId,
            sortOrder: item.sortOrder,
          });

          if (result.ok) uploaded += 1;
          else failed.push({ fileName: item.fileName, error: result.error });
        }

        done += 1;
        setPhase({ kind: "uploading", done, total: done + queue.length, current: item.fileName });
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    // Once, at the end: the cache work is a whole-catalogue operation.
    await finishPhotoBatchAction().catch(() => undefined);

    setPhase({ kind: "finished", uploaded, failed });
  }

  function reset() {
    filesRef.current = new Map();
    setAssigned(new Map());
    setError(null);
    setPhase({ kind: "choosing" });
    if (inputRef.current) inputRef.current.value = "";
    if (folderRef.current) folderRef.current.value = "";
  }

  return (
    <div className="space-y-5">
      {error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {/* ── Choose files ── */}
      {phase.kind === "choosing" || phase.kind === "matching" ? (
        <ChooseFiles
          inputRef={inputRef}
          folderRef={folderRef}
          matching={phase.kind === "matching"}
          onChoose={choose}
          productCount={products.length}
        />
      ) : null}

      {/* ── What will happen ── */}
      {phase.kind === "ready" ? (
        <ReadyToUpload
          match={phase.match}
          products={products}
          mode={mode}
          onMode={changeMode}
          assigned={assigned}
          onAssign={(fileName, productId) =>
            setAssigned((previous) => new Map(previous).set(fileName, productId))
          }
          onUpload={upload}
          onCancel={reset}
        />
      ) : null}

      {/* ── Progress ── */}
      {phase.kind === "uploading" ? (
        <Progress done={phase.done} total={phase.total} current={phase.current} />
      ) : null}

      {/* ── Result ── */}
      {phase.kind === "finished" ? (
        <Finished uploaded={phase.uploaded} failed={phase.failed} onAgain={reset} />
      ) : null}
    </div>
  );
}

/**
 * How many photos a product already has, for a hand-assigned file.
 *
 * A file the matcher could not place has no group, so its slot is read from
 * whichever group the product does have — and zero when it has none, which is
 * correct for a product with no photos at all.
 */
function existingCountFor(match: PhotoMatch, productId: string): number {
  return match.products.find((group) => group.productId === productId)?.existingCount ?? 0;
}

/**
 * The name to match on.
 *
 * A folder selection reports `webkitRelativePath` ("photos/batch1/A.jpg"); the
 * parser drops the directory part. Using it rather than `file.name` keeps the
 * names unique when two folders both contain `1.jpg`.
 */
function relativeName(file: File): string {
  const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  return relative && relative.length > 0 ? relative : file.name;
}

/**
 * Upload one photo through the existing signed flow, with retries.
 *
 * Identical to the single-product form's path — signature, direct POST to the
 * provider, server-side verification — so there is one upload mechanism in the
 * application and bulk upload cannot drift from it. `optimizeUpload` runs
 * inside the local provider's receiver as it always has.
 */
async function uploadOne(input: {
  file: File;
  productId: string;
  sortOrder: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  let lastError = "upload failed";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const ticket = await requestUploadAction("product");
      if (!ticket.ok) return { ok: false, error: ticket.error };

      if (input.file.size > ticket.maxBytes) {
        // Not retried: it will be too large next time too.
        return {
          ok: false,
          error: `too large (${Math.round(input.file.size / (1024 * 1024))} MB)`,
        };
      }

      const form = new FormData();
      for (const [key, value] of Object.entries(ticket.fields)) form.append(key, value);
      // Last: providers expect the file after its parameters.
      form.append("file", input.file);

      const response = await fetch(ticket.uploadUrl, { method: "POST", body: form });
      if (!response.ok) throw new Error(`upload failed (${response.status})`);

      const raw = await response.json();

      const confirmed = await confirmUploadAction("product", raw);
      if (!confirmed.ok) return { ok: false, error: confirmed.error };

      const attached = await attachPhotoAction({
        productId: input.productId,
        asset: {
          url: confirmed.url,
          publicId: confirmed.publicId,
          provider: confirmed.provider === "S3" ? "S3" : "CLOUDINARY",
          width: confirmed.width ?? undefined,
          height: confirmed.height ?? undefined,
          bytes: confirmed.bytes ?? undefined,
          mimeType: confirmed.mimeType ?? undefined,
        },
        // Fixed before any upload began, so a retry lands in the same slot as
        // the attempt it replaces.
        sortOrder: input.sortOrder,
      });

      if (!attached.ok) return { ok: false, error: attached.error };

      return { ok: true };
    } catch (caught) {
      lastError = caught instanceof Error ? caught.message : "upload failed";
      // Growing delay: an overloaded connection is not helped by retrying
      // instantly three times.
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
      }
    }
  }

  return { ok: false, error: lastError };
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function ChooseFiles({
  inputRef,
  folderRef,
  matching,
  onChoose,
  productCount,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  folderRef: React.RefObject<HTMLInputElement | null>;
  matching: boolean;
  onChoose: (files: FileList | null) => void;
  productCount: number;
}) {
  const [dragging, setDragging] = useState(false);

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5">
      <h2 className="font-medium">Choose your photos</h2>
      <p className="mt-1 text-sm text-neutral-600">
        Name each photo with its product code: <span className="font-mono">LED-9W-CW.jpg</span> for
        the main photo, <span className="font-mono">LED-9W-CW_2.jpg</span> for the second, up to
        _{MAX_PHOTOS_PER_PRODUCT}.
      </p>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          onChoose(event.dataTransfer.files);
        }}
        className={`mt-4 rounded-lg border-2 border-dashed p-6 text-center ${
          dragging ? "border-neutral-900 bg-neutral-50" : "border-neutral-300"
        }`}
      >
        <p className="text-sm text-neutral-600">Drag photos here, or:</p>

        <div className="mt-3 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            disabled={matching}
            onClick={() => inputRef.current?.click()}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            {matching ? "Checking…" : "Select photos"}
          </button>

          <button
            type="button"
            disabled={matching}
            onClick={() => folderRef.current?.click()}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
          >
            Select a whole folder
          </button>
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(event) => onChoose(event.currentTarget.files)}
        />

        {/*
          `webkitdirectory` is the only way to offer a folder picker. It is not
          in React's JSX types, so it is spread in — supported in every current
          browser, and the plain file picker above is the fallback where it is
          not.
        */}
        <input
          ref={folderRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => onChoose(event.currentTarget.files)}
          {...{ webkitdirectory: "", directory: "" }}
        />

        <p className="mt-3 text-xs text-neutral-500">
          JPG, PNG or WEBP · up to 500 photos at a time
        </p>
      </div>

      {productCount === 0 ? (
        <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          None of your products have a product code (SKU) yet. Add codes first — photos are matched
          by them.
        </p>
      ) : (
        <p className="mt-4 text-xs text-neutral-500">
          {productCount} product{productCount === 1 ? "" : "s"} with a SKU can receive photos.
        </p>
      )}
    </section>
  );
}

function ReadyToUpload({
  match,
  products,
  mode,
  onMode,
  assigned,
  onAssign,
  onUpload,
  onCancel,
}: {
  match: PhotoMatch;
  products: PhotoTarget[];
  mode: Mode;
  onMode: (mode: Mode) => void;
  assigned: Map<string, string>;
  onAssign: (fileName: string, productId: string) => void;
  onUpload: () => void;
  onCancel: () => void;
}) {
  const matchedCount = match.products.reduce((total, group) => total + group.files.length, 0);
  const overCap = match.products.filter((group) => group.overCapBy > 0);

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="font-medium">Check before uploading</h2>
        <p className="mt-1 text-sm text-neutral-600">
          {matchedCount} photo{matchedCount === 1 ? "" : "s"} matched{" "}
          {match.products.length} product{match.products.length === 1 ? "" : "s"}.
          {match.unmatched.length > 0
            ? ` ${match.unmatched.length} file${match.unmatched.length === 1 ? "" : "s"} did not match.`
            : ""}
        </p>

        {/* ── Add or replace ── */}
        <fieldset className="mt-4">
          <legend className="text-sm font-medium">What should happen to existing photos?</legend>

          <div className="mt-2 space-y-2">
            {/*
              "Add" is the default because it is the recoverable one: adding a
              photo too many is a tidy-up, replacing deletes photographs the
              seller may not have another copy of.
            */}
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="photo-mode"
                checked={mode === "add"}
                onChange={() => onMode("add")}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">Add to existing photos</span>
                <span className="block text-xs text-neutral-500">
                  Keeps photos already on the product.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="photo-mode"
                checked={mode === "replace"}
                onChange={() => onMode("replace")}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">Replace all photos</span>
                <span className="block text-xs text-red-700">
                  Deletes the photos these products have now. This cannot be undone.
                </span>
              </span>
            </label>
          </div>
        </fieldset>
      </section>

      {overCap.length > 0 ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {overCap.length} product{overCap.length === 1 ? "" : "s"} would go over the{" "}
          {MAX_PHOTOS_PER_PRODUCT}-photo limit. The extra photos will be skipped — choose
          &ldquo;Replace all photos&rdquo; if you want the new ones instead.
        </p>
      ) : null}

      {/* ── Matched, per product ── */}
      {match.products.length > 0 ? (
        <section className="rounded-lg border border-neutral-200 bg-white">
          <h3 className="border-b border-neutral-200 px-4 py-3 text-sm font-medium">
            Photos per product
          </h3>

          <ul className="divide-y divide-neutral-200">
            {match.products.map((group) => (
              <li key={group.productId} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {group.productName}
                  </span>
                  <span className="font-mono text-xs text-neutral-500">{group.sku}</span>
                  <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-800">
                    {group.files.length} photo{group.files.length === 1 ? "" : "s"}
                  </span>
                </div>

                <p className="mt-0.5 text-xs text-neutral-500">
                  {group.existingCount > 0
                    ? `${group.existingCount} already on this product · `
                    : ""}
                  {group.files.map((file) => `#${file.position}`).join(" ")}
                  {group.overCapBy > 0 ? ` · ${group.overCapBy} will be skipped` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ── Unmatched, with a dropdown each ── */}
      {match.unmatched.length > 0 ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50/40">
          <h3 className="border-b border-amber-200 px-4 py-3 text-sm font-medium">
            These files did not match a product
          </h3>

          <ul className="divide-y divide-amber-200">
            {match.unmatched.map((file) => (
              <li key={file.fileName} className="px-4 py-3">
                <p className="truncate font-mono text-xs">{file.fileName}</p>
                <p className="mt-0.5 text-xs text-amber-900">{file.reason}</p>

                {/* Assigning by hand beats renaming a file and starting over. */}
                <select
                  value={assigned.get(file.fileName) ?? ""}
                  onChange={(event) => onAssign(file.fileName, event.currentTarget.value)}
                  className="mt-2 w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm sm:max-w-sm"
                >
                  <option value="">Skip this file</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} ({product.sku})
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onUpload}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Upload photos
        </button>

        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
        >
          Choose different photos
        </button>
      </div>
    </div>
  );
}

function Progress({ done, total, current }: { done: number; total: number; current: string }) {
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5">
      <h2 className="font-medium">Uploading photos…</h2>

      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Upload progress"
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-neutral-200"
      >
        <div
          className="h-full rounded-full bg-neutral-900 transition-[width] duration-200"
          style={{ width: `${percent}%` }}
        />
      </div>

      <p className="mt-2 text-sm text-neutral-600" role="status">
        {done} of {total} done
      </p>
      <p className="mt-0.5 truncate text-xs text-neutral-500">{current}</p>
      <p className="mt-3 text-xs text-neutral-500">
        Keep this page open until it finishes. Photos already uploaded are saved.
      </p>
    </section>
  );
}

function Finished({
  uploaded,
  failed,
  onAgain,
}: {
  uploaded: number;
  failed: Array<{ fileName: string; error: string }>;
  onAgain: () => void;
}) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5">
      <h2 className="font-medium">
        {uploaded} photo{uploaded === 1 ? "" : "s"} uploaded
      </h2>

      {failed.length > 0 ? (
        <div className="mt-3 rounded-md bg-red-50 px-3 py-3 text-sm text-red-800">
          <p className="font-medium">
            {failed.length} photo{failed.length === 1 ? "" : "s"} did not upload.
          </p>
          <ul className="mt-1 space-y-0.5">
            {/* Named, so the seller re-selects these few rather than all 500. */}
            {failed.slice(0, 20).map((file) => (
              <li key={file.fileName} className="text-xs">
                <span className="font-mono">{file.fileName}</span> — {file.error}
              </li>
            ))}
          </ul>
          {failed.length > 20 ? (
            <p className="mt-1 text-xs">…and {failed.length - 20} more.</p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          href="/dashboard/products"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Go to products and publish
        </Link>
        <button
          type="button"
          onClick={onAgain}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
        >
          Upload more photos
        </button>
      </div>
    </section>
  );
}
