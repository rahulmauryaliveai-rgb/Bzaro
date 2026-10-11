"use client";

import { useActionState, useState } from "react";
import { publishSelectedAction, type ImportActionState } from "@/server/actions/import";

/**
 * Select products and publish them together (D49).
 *
 * ── Why this exists next to the per-row Publish button ────────────────────
 * Bulk upload creates drafts, so the step after adding photos is publishing
 * forty products. Doing that one button at a time, each a full page reload, is
 * not a feature — it is why sellers abandon the import halfway and leave their
 * catalogue invisible.
 *
 * ── Not-ready products are visibly not selectable ────────────────────────
 * A product with no category or no photograph cannot be published, and the
 * checkbox says so rather than letting the seller tick it and read an error
 * afterwards. The rule is enforced on the server too (`publishProducts`) —
 * this is the explanation, not the control.
 */

const INITIAL: ImportActionState = {};

export type PublishableProduct = {
  id: string;
  name: string;
  hasCategory: boolean;
  hasPhoto: boolean;
  isDraft: boolean;
};

export function PublishSelected({ products }: { products: PublishableProduct[] }) {
  const [state, action, pending] = useActionState(publishSelectedAction, INITIAL);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const ready = products.filter(
    (product) => product.isDraft && product.hasCategory && product.hasPhoto,
  );
  const blocked = products.filter(
    (product) => product.isDraft && (!product.hasCategory || !product.hasPhoto),
  );

  if (ready.length === 0 && blocked.length === 0) return null;

  const toggle = (id: string) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected = ready.length > 0 && selected.size === ready.length;

  return (
    <section className="mb-6 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">
          {ready.length} draft{ready.length === 1 ? "" : "s"} ready to publish
        </h2>

        {ready.length > 0 ? (
          <button
            type="button"
            onClick={() =>
              setSelected(allSelected ? new Set() : new Set(ready.map((product) => product.id)))
            }
            className="text-xs text-neutral-700 underline underline-offset-2"
          >
            {allSelected ? "Clear selection" : "Select all ready"}
          </button>
        ) : null}
      </div>

      {state.error ? (
        <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      {state.message ? (
        <p role="status" className="mt-3 rounded-md bg-teal-50 px-3 py-2 text-sm text-teal-900">
          {state.message}
        </p>
      ) : null}

      {ready.length > 0 ? (
        <form action={action} className="mt-3">
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {ready.map((product) => (
              <li key={product.id}>
                <label className="flex items-center gap-2 py-1 text-sm">
                  <input
                    type="checkbox"
                    name="productId"
                    value={product.id}
                    checked={selected.has(product.id)}
                    onChange={() => toggle(product.id)}
                  />
                  <span className="min-w-0 truncate">{product.name}</span>
                </label>
              </li>
            ))}
          </ul>

          <button
            type="submit"
            disabled={pending || selected.size === 0}
            className="mt-3 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending
              ? "Publishing…"
              : selected.size === 0
                ? "Select products to publish"
                : `Publish ${selected.size} product${selected.size === 1 ? "" : "s"}`}
          </button>
        </form>
      ) : null}

      {blocked.length > 0 ? (
        <p className="mt-3 text-xs text-neutral-500">
          {blocked.length} more draft{blocked.length === 1 ? " is" : "s are"} not ready:{" "}
          {blocked.filter((product) => !product.hasPhoto).length} need a photo and{" "}
          {blocked.filter((product) => !product.hasCategory).length} need a category.
        </p>
      ) : null}
    </section>
  );
}
