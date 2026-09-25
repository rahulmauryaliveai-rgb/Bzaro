"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { closeRequirementAction } from "@/server/actions/buyer-account";

/** Two-step inline confirm — closing also stops new suppliers picking it up. */
export function CloseRequirementButton({ requirementId }: { requirementId: string }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex min-h-10 items-center rounded-lg border border-neutral-300 px-3 text-sm font-medium hover:bg-neutral-50"
      >
        ✓ I found a supplier — close
      </button>
    );
  }

  return (
    <form action={closeRequirementAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="requirementId" value={requirementId} />
      <span className="text-sm text-neutral-600">No new suppliers will get it. Close?</span>
      <ConfirmButton />
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="min-h-10 rounded-lg px-3 text-sm text-neutral-600 hover:bg-neutral-100"
      >
        Cancel
      </button>
    </form>
  );
}

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-10 rounded-lg bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
    >
      {pending ? "Closing…" : "Yes, close it"}
    </button>
  );
}
