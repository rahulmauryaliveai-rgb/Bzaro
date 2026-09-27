"use client";

import { useActionState, useState } from "react";
import { requestRefundAction, type RefundFormState } from "@/server/actions/billing";

/**
 * "Request a refund" (D41). Collapsed behind a button so it is findable but
 * not the first thing a new subscriber sees; the reasons are fixed because a
 * refund is only offered when leads are not arriving for the seller's
 * categories.
 */
export function RefundForm({
  paymentId,
  reasons,
  amountLabel,
  deadlineLabel,
}: {
  paymentId: string;
  reasons: readonly string[];
  amountLabel: string;
  deadlineLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<RefundFormState, FormData>(
    requestRefundAction,
    {},
  );

  if (state.ok) {
    return (
      <p
        role="status"
        className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900"
      >
        Refund request sent. Our team reviews it within 2 working days and replies by email.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
      >
        Request a refund
      </button>
    );
  }

  return (
    <form action={action} className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
      <input type="hidden" name="paymentId" value={paymentId} />
      <p className="text-sm text-neutral-700">
        Refund of <strong>{amountLabel}</strong> — available until {deadlineLabel}. Approved refunds
        return to your original payment method in 5–7 working days, and your account moves to the
        Free plan.
      </p>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-neutral-900">Reason</legend>
        {reasons.map((reason, index) => (
          <label key={reason} className="flex items-start gap-2 text-sm text-neutral-700">
            <input
              type="radio"
              name="reason"
              value={reason}
              defaultChecked={index === 0}
              className="mt-1"
            />
            {reason}
          </label>
        ))}
      </fieldset>
      <label className="block text-sm">
        <span className="font-medium text-neutral-900">Anything we should know? (optional)</span>
        <textarea
          name="details"
          rows={3}
          maxLength={2000}
          placeholder="e.g. the categories you expected leads in"
          className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2"
        />
      </label>
      {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send refund request"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
