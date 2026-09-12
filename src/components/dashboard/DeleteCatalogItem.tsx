"use client";

import { useActionState } from "react";
import { deleteCatalogItemAction, type CatalogActionState } from "@/server/actions/catalog";

/**
 * Delete control for a catalogue item.
 *
 * Behind a `<details>` and gated on an explicit tick, because deleting is the
 * one action on this page a seller cannot undo themselves. Two deliberate acts
 * to reach it is the right amount of friction for something irreversible sitting
 * next to an everyday Save button.
 *
 * The record is soft-deleted (see catalog.service), so enquiries that reference
 * it keep working — but the seller has no way back to it, which is what the
 * warning says.
 */

const INITIAL: CatalogActionState = {};

export function DeleteCatalogItem({
  kind,
  id,
  name,
}: {
  kind: "product" | "service";
  id: string;
  name: string;
}) {
  const [state, action, pending] = useActionState(deleteCatalogItemAction, INITIAL);

  return (
    <details className="rounded-lg border border-red-200 bg-red-50/40 p-4">
      <summary className="cursor-pointer text-sm font-medium text-red-800">
        Delete this {kind}
      </summary>

      <form action={action} className="mt-3 space-y-3">
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="id" value={id} />

        <p className="text-sm text-neutral-700">
          <strong>{name}</strong> will be removed from your website and the marketplace. Existing
          enquiries about it are kept, but you cannot restore the listing yourself.
        </p>

        {state.error ? (
          <p role="alert" className="text-sm text-red-700">
            {state.error}
          </p>
        ) : null}

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="confirm" />
          <span>Yes, delete it</span>
        </label>

        {state.fieldErrors?.confirm ? (
          <p className="text-xs text-red-600">{state.fieldErrors.confirm}</p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-60"
        >
          {pending ? "Deleting…" : `Delete ${kind}`}
        </button>
      </form>
    </details>
  );
}
