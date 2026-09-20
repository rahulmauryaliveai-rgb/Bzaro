"use client";

import { useActionState } from "react";
import { verifySellerPhoneAction, type OnboardingState } from "@/server/actions/onboarding";
import { PhoneOtpFields } from "@/components/onboarding/PhoneOtpFields";

/** Verify (or change) the owner's mobile number from dashboard settings. */
export function VerifyPhoneForm({ defaultPhone }: { defaultPhone: string }) {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(
    verifySellerPhoneAction,
    {},
  );

  if (state.ok) {
    return (
      <p className="mt-4 rounded-md bg-teal-50 px-3 py-2 text-sm text-teal-900">
        Your mobile number is verified.
      </p>
    );
  }

  return (
    <form action={action} className="mt-4 space-y-3 rounded-md border border-neutral-200 p-4">
      <PhoneOtpFields
        defaultPhone={defaultPhone}
        required
        errors={{ phone: state.fieldErrors?.phone, otpCode: state.fieldErrors?.otpCode }}
      />
      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60"
      >
        {pending ? "Verifying…" : "Verify number"}
      </button>
    </form>
  );
}
