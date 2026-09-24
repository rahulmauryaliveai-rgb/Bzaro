"use client";

import { useActionState, useEffect, useState } from "react";
import { isSellerSavedAction, toggleSavedSellerAction } from "@/server/actions/buyer";

/**
 * Save a supplier for later.
 *
 * The saved state is fetched after mount, not during render, so the seller and
 * product pages that mount this stay static and crawlable — the same rule the
 * contact modal and location bar follow.
 *
 * Hidden entirely when nobody is signed in: a control that only ever says
 * "sign in first" is noise on a page whose job is to convert.
 */
export function SaveSellerButton({ sellerId }: { sellerId: string }) {
  const [saved, setSaved] = useState<boolean | null>(null);
  const [state, action, pending] = useActionState(toggleSavedSellerAction, {});

  useEffect(() => {
    let cancelled = false;
    isSellerSavedAction(sellerId)
      .then((result) => {
        if (!cancelled) setSaved(result);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [sellerId]);

  // Derived, not synced through an effect: the action already returns the new
  // state, so mirroring it into a second piece of state would just cascade a
  // render and risk the two disagreeing.
  const isSaved = state.ok && state.saved !== undefined ? state.saved : saved;

  // null = signed out, or still resolving.
  if (isSaved === null) return null;

  return (
    <form action={action}>
      <input type="hidden" name="sellerId" value={sellerId} />
      <button
        type="submit"
        disabled={pending}
        aria-pressed={isSaved}
        className={`inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 text-sm font-medium disabled:opacity-60 ${
          isSaved
            ? "border-neutral-900 bg-neutral-900 text-white"
            : "border-neutral-300 text-neutral-800 hover:bg-neutral-50"
        }`}
      >
        {isSaved ? "★ Saved" : "☆ Save supplier"}
      </button>
      {state.error ? (
        <p className="mt-1 text-xs text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
