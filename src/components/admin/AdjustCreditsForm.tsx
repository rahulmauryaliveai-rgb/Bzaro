"use client";

import { useActionState } from "react";
import { adjustCreditsAction, type AdjustCreditsState } from "@/server/actions/admin-leads";

/** Manual credit adjustment. The note is required — it is the audit trail. */
export function AdjustCreditsForm({ sellerId }: { sellerId: string }) {
  const [state, action, pending] = useActionState<AdjustCreditsState, FormData>(
    adjustCreditsAction,
    {},
  );

  return (
    <form action={action} className="mt-3 flex flex-wrap items-end gap-2 text-sm">
      <input type="hidden" name="sellerId" value={sellerId} />
      <label className="text-xs text-neutral-400">
        Change
        <input
          name="delta"
          type="number"
          required
          min={-1000}
          max={1000}
          placeholder="+5 or -2"
          className="mt-1 w-24 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-white"
        />
      </label>
      <label className="flex-1 text-xs text-neutral-400">
        Reason (required)
        <input
          name="note"
          required
          minLength={3}
          maxLength={500}
          className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-white"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-white px-3 py-1.5 text-xs font-medium text-neutral-900 hover:bg-neutral-200 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Adjust"}
      </button>
      {state.ok ? (
        <p className="w-full text-xs text-teal-300">Done. Balance is now {state.balanceAfter}.</p>
      ) : null}
      {state.error ? (
        <p role="alert" className="w-full text-xs text-red-300">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
