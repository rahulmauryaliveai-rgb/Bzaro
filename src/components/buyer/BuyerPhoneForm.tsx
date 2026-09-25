"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { setBuyerPhoneAction, type BuyerAuthState } from "@/server/actions/buyer";
import { Field } from "@/components/dashboard/fields";

export function BuyerPhoneForm({ continueTo = "/account/continue" }: { continueTo?: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<BuyerAuthState, FormData>(
    setBuyerPhoneAction,
    {},
  );

  useEffect(() => {
    // /account/continue resumes an unsent requirement, else shows the list.
    if (state.step === "done") router.push(continueTo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.step]);

  return (
    <form action={action} className="space-y-4">
      <Field
        label="Mobile number"
        name="phone"
        type="tel"
        required
        placeholder="+919876543210"
        error={state.fieldErrors?.phone}
      />

      {state.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="min-h-11 w-full rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save and continue"}
      </button>
    </form>
  );
}
