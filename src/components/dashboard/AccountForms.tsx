"use client";

import { useActionState } from "react";
import { changePasswordAction, type AccountState } from "@/server/actions/account";

const INITIAL: AccountState = {};

/** Password change. Signs the user out everywhere else on success (D19). */
export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, INITIAL);

  return (
    <form action={action} className="space-y-4">
      {state.ok ? (
        <p role="status" className="rounded-md bg-teal-50 px-3 py-2 text-sm text-teal-800">
          {state.message}
        </p>
      ) : null}

      {state.error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      <Field
        label="Current password"
        name="currentPassword"
        autoComplete="current-password"
        error={state.fieldErrors?.currentPassword}
      />
      <Field
        label="New password"
        name="password"
        autoComplete="new-password"
        hint="At least 10 characters. Length beats symbols."
        error={state.fieldErrors?.password}
      />
      <Field
        label="Confirm new password"
        name="confirmPassword"
        autoComplete="new-password"
        error={state.fieldErrors?.confirmPassword}
      />

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Changing…" : "Change password"}
      </button>

      <p className="text-xs text-neutral-500">
        Changing your password signs you out on every other device.
      </p>
    </form>
  );
}

function Field({
  label,
  name,
  autoComplete,
  hint,
  error,
}: {
  label: string;
  name: string;
  autoComplete?: string;
  hint?: string;
  error?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type="password"
        required
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        className={`w-full rounded-md border px-3 py-2 text-sm ${
          error ? "border-red-500" : "border-neutral-300"
        }`}
      />
      {hint && !error ? <p className="mt-1 text-xs text-neutral-500">{hint}</p> : null}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
