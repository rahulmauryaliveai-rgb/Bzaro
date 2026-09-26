"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Field, Select } from "@/components/dashboard/fields";
import {
  deleteBuyerAccountAction,
  updateBuyerProfileAction,
  type AccountFormState,
} from "@/server/actions/buyer-account";
import {
  requestBuyerPasswordResetAction,
  resetBuyerPasswordAction,
  setBuyerPhoneAction,
  type BuyerAuthState,
} from "@/server/actions/buyer";

const card = "rounded-lg border border-neutral-200 bg-white p-5";
const primary =
  "inline-flex min-h-10 items-center rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60";
const secondary =
  "inline-flex min-h-10 items-center rounded-lg border border-neutral-300 px-4 text-sm font-medium hover:bg-neutral-50 disabled:opacity-60";

function Saved({ show, children = "Saved." }: { show?: boolean; children?: React.ReactNode }) {
  if (!show) return null;
  return (
    <p role="status" className="text-accent-700 text-sm font-medium">
      {children}
    </p>
  );
}

function Problem({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-red-600">
      {message}
    </p>
  );
}

export function DetailsForm({
  name,
  locationId,
  notifyOnResponse,
  cities,
}: {
  name: string;
  locationId: string;
  notifyOnResponse: boolean;
  cities: Array<{ id: string; name: string }>;
}) {
  const [state, action, pending] = useActionState<AccountFormState, FormData>(
    updateBuyerProfileAction,
    {},
  );

  return (
    <form action={action} className={`${card} space-y-4`}>
      <h2 className="text-base font-semibold">Your details</h2>
      <Field
        label="Name"
        name="name"
        defaultValue={name}
        required
        maxLength={120}
        error={state.fieldErrors?.name}
      />
      <Select
        label="Default city"
        name="locationId"
        defaultValue={locationId}
        placeholder="Choose a city"
        hint="Pre-fills your requirements."
        options={cities.map((city) => ({ value: city.id, label: city.name }))}
        error={state.fieldErrors?.locationId}
      />
      <label className="flex items-start gap-2 text-sm text-neutral-800">
        <input
          type="checkbox"
          name="notifyOnResponse"
          defaultChecked={notifyOnResponse}
          className="mt-1 h-4 w-4"
        />
        <span>
          Email me when a supplier responds to my requirement
          <span className="block text-xs text-neutral-500">WhatsApp alerts are coming soon.</span>
        </span>
      </label>
      <Problem message={state.error} />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={primary}>
          {pending ? "Saving…" : "Save changes"}
        </button>
        <Saved show={state.ok && !pending} />
      </div>
    </form>
  );
}

export function PhoneForm({ phone }: { phone: string | null }) {
  const [state, action, pending] = useActionState<BuyerAuthState, FormData>(
    setBuyerPhoneAction,
    {},
  );

  return (
    <form action={action} className={`${card} space-y-4`}>
      <div>
        <h2 className="text-base font-semibold">Mobile number</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Suppliers call or WhatsApp you on this number once they accept a requirement.
        </p>
      </div>
      <Field
        label="Mobile"
        name="phone"
        type="tel"
        defaultValue={phone ?? ""}
        placeholder="98765 43210"
        inputMode="tel"
        autoComplete="tel"
        required
        error={state.fieldErrors?.phone}
      />
      <Problem message={state.error} />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={secondary}>
          {pending ? "Saving…" : "Update number"}
        </button>
        <Saved show={state.ok && !pending} />
      </div>
    </form>
  );
}

/**
 * Set or change the password with an emailed code — the same OTP flow as
 * "Forgot password", so Google-only buyers can add one too. Completing it
 * signs out every session (security), so the buyer signs in again.
 */
export function PasswordCard({ email, hasPassword }: { email: string; hasPassword: boolean }) {
  const [stage, setStage] = useState<"idle" | "code" | "done">("idle");
  const [requestState, requestAction, requesting] = useActionState<BuyerAuthState, FormData>(
    async (previous, formData) => {
      const result = await requestBuyerPasswordResetAction(previous, formData);
      if (result.step === "otp") setStage("code");
      return result;
    },
    {},
  );
  const [resetState, resetAction, resetting] = useActionState<BuyerAuthState, FormData>(
    async (previous, formData) => {
      const result = await resetBuyerPasswordAction(previous, formData);
      if (result.step === "done") setStage("done");
      return result;
    },
    {},
  );

  return (
    <div className={`${card} space-y-3`}>
      <h2 className="text-base font-semibold">Password</h2>
      {stage === "idle" ? (
        <form action={requestAction} className="space-y-3">
          <input type="hidden" name="email" value={email} />
          <p className="text-sm text-neutral-600">
            {hasPassword
              ? "Change your password. We'll email a 6-digit code to confirm it's you."
              : "You sign in with Google. Add a password to also sign in with your email."}
          </p>
          <Problem message={requestState.error} />
          <button type="submit" disabled={requesting} className={secondary}>
            {requesting ? "Sending code…" : hasPassword ? "Change password" : "Set a password"}
          </button>
        </form>
      ) : null}

      {stage === "code" ? (
        <form action={resetAction} className="space-y-3">
          <input type="hidden" name="email" value={email} />
          <p className="text-sm text-neutral-600">Enter the code we emailed to {email}.</p>
          <Field
            label="6-digit code"
            name="code"
            inputMode="numeric"
            maxLength={6}
            required
            error={resetState.fieldErrors?.code}
          />
          <Field
            label="New password"
            name="password"
            type="password"
            required
            hint="At least 10 characters."
            error={resetState.fieldErrors?.password}
          />
          <Field
            label="Confirm password"
            name="confirmPassword"
            type="password"
            required
            error={resetState.fieldErrors?.confirmPassword}
          />
          <Problem message={resetState.error} />
          <button type="submit" disabled={resetting} className={primary}>
            {resetting ? "Saving…" : "Save password"}
          </button>
        </form>
      ) : null}

      {stage === "done" ? (
        <p role="status" className="text-sm text-neutral-700">
          Password saved. For your security you&apos;ve been signed out everywhere —{" "}
          <Link href="/account/signin" className="text-brand-700 font-medium underline">
            sign in again
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}

export function DeleteAccountCard() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<AccountFormState, FormData>(
    deleteBuyerAccountAction,
    {},
  );

  return (
    <div className="space-y-3 rounded-lg border border-red-200 bg-red-50/40 p-5">
      <h2 className="text-base font-semibold">Delete account</h2>
      <p className="text-sm text-neutral-600">
        Erases your profile, number and saved suppliers. Requirements already delivered to suppliers
        can&apos;t be recalled.
      </p>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-10 items-center rounded-lg border border-red-300 px-4 text-sm font-medium text-red-700 hover:bg-red-50"
        >
          Delete my account
        </button>
      ) : (
        <form action={action} className="space-y-3">
          <Field
            label="Type DELETE to confirm"
            name="confirm"
            required
            error={state.fieldErrors?.confirm}
          />
          <Problem message={state.error} />
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex min-h-10 items-center rounded-lg bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
            >
              {pending ? "Deleting…" : "Permanently delete"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="min-h-10 rounded-lg px-3 text-sm text-neutral-600 hover:bg-neutral-100"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
