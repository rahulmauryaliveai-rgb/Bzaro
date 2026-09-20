"use client";

import { useActionState, useState } from "react";
import {
  acceptLeadAction,
  closeLeadAction,
  flagLeadAction,
  type AcceptLeadState,
  type FlagLeadState,
} from "@/server/actions/lead";
import { FLAG_REASON_LABELS } from "@/lib/validation/lead";
import type { LeadView } from "@/lib/leads/projection";

/**
 * Accept / close / flag controls for the lead detail page.
 *
 * Accept is a real form with a confirmation step — it spends a credit, and a
 * button that silently charges is the kind of thing sellers dispute. The
 * server re-checks everything (status, expiry, balance); the confirm here is
 * purely so nobody accepts by accident.
 */
export function AcceptLead({ lead, creditBalance }: { lead: LeadView; creditBalance: number }) {
  const [state, action, pending] = useActionState<AcceptLeadState, FormData>(acceptLeadAction, {});
  const [confirming, setConfirming] = useState(false);

  if (state.ok) {
    return (
      <p className="rounded-md bg-teal-50 px-3 py-2 text-sm text-teal-800">
        Accepted. Buyer details are now visible.{" "}
        {state.balanceAfter !== undefined ? `${state.balanceAfter} credits left.` : null}
      </p>
    );
  }

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="leadId" value={lead.id} />
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
          >
            {pending ? "Accepting…" : "Confirm — use 1 credit"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-md px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Accept lead · 1 credit
        </button>
      )}
      <p className="text-xs text-neutral-500">
        {creditBalance} credit{creditBalance === 1 ? "" : "s"} available. Accepting reveals the
        buyer&apos;s number and name.
      </p>
      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

export function CloseLead({ leadId }: { leadId: string }) {
  return (
    <form action={closeLeadAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="leadId" value={leadId} />
      <label className="flex-1 text-xs text-neutral-600">
        Note (optional)
        <input
          name="note"
          maxLength={1000}
          placeholder="Won, lost, not relevant…"
          className="mt-1 w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm"
        />
      </label>
      <button
        type="submit"
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50"
      >
        Close lead
      </button>
    </form>
  );
}

export function FlagLead({ leadId, refundable }: { leadId: string; refundable: boolean }) {
  const [state, action, pending] = useActionState<FlagLeadState, FormData>(flagLeadAction, {});
  const [open, setOpen] = useState(false);

  if (state.ok) {
    return (
      <p className="text-xs text-neutral-600">
        Flagged.{" "}
        {refundable ? "If we agree, the credit comes back to you." : "Thanks — we'll look into it."}
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-neutral-500 underline-offset-2 hover:underline"
      >
        Something wrong with this lead?
      </button>
    );
  }

  return (
    <form action={action} className="space-y-2 rounded-md border border-neutral-200 p-3">
      <input type="hidden" name="leadId" value={leadId} />
      <label className="block text-xs text-neutral-600">
        Reason
        <select
          name="reason"
          required
          defaultValue=""
          className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm"
        >
          <option value="" disabled>
            Choose…
          </option>
          {Object.entries(FLAG_REASON_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs text-neutral-600">
        Details (optional)
        <textarea
          name="note"
          rows={2}
          maxLength={1000}
          className="mt-1 w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm"
        />
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 disabled:opacity-60"
        >
          {pending ? "Sending…" : "Flag lead"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-3 py-1.5 text-sm text-neutral-600"
        >
          Cancel
        </button>
      </div>
      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
