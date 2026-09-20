"use client";

import { useState, useTransition } from "react";
import { requestOtpAction } from "@/server/actions/otp";

/**
 * Mobile number + "Send code" + one-time code, for embedding inside a larger
 * form (the account step, the settings page).
 *
 * "Send code" calls the OTP action directly rather than through a nested
 * form — forms cannot nest — and the parent form's action verifies the code.
 * The number is normalised server-side; whatever the server echoes back is
 * what the hidden `phone` field carries, so the verify step sees the same
 * E.164 string the challenge was issued for.
 */
export function PhoneOtpFields({
  defaultPhone = "",
  errors,
  required = true,
}: {
  defaultPhone?: string;
  errors?: { phone?: string; otpCode?: string };
  /** When false the code is optional and the copy says so. */
  required?: boolean;
}) {
  const [phone, setPhone] = useState(defaultPhone);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function sendCode() {
    setSendError(null);
    const data = new FormData();
    data.set("phone", phone);
    data.set("purpose", "SELLER_SIGNUP");
    startTransition(async () => {
      const result = await requestOtpAction({}, data);
      if (result.ok && result.phone) {
        setSentTo(result.phone);
        setPhone(result.phone);
      } else {
        setSendError(result.error ?? result.fieldErrors?.phone ?? "Could not send the code.");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="phone" className="mb-1 block text-sm font-medium">
          Mobile number
        </label>
        <div className="flex gap-2">
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            required
            value={phone}
            onChange={(event) => {
              setPhone(event.currentTarget.value);
              setSentTo(null);
            }}
            placeholder="98765 43210"
            className={`w-full rounded-md border px-3 py-2 text-sm ${
              errors?.phone ? "border-red-500" : "border-neutral-300"
            }`}
          />
          <button
            type="button"
            onClick={sendCode}
            disabled={pending || phone.trim().length < 10}
            className="shrink-0 rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
          >
            {pending ? "Sending…" : sentTo ? "Resend code" : "Send code"}
          </button>
        </div>
        {errors?.phone ? (
          <p className="mt-1 text-xs text-red-600" role="alert">
            {errors.phone}
          </p>
        ) : sendError ? (
          <p className="mt-1 text-xs text-red-600" role="alert">
            {sendError}
          </p>
        ) : sentTo ? (
          <p className="mt-1 text-xs text-teal-700">Code sent to {sentTo}.</p>
        ) : (
          <p className="mt-1 text-xs text-neutral-500">
            We send a one-time code to confirm the number buyers will reach you on.
          </p>
        )}
      </div>

      <div>
        <label htmlFor="otpCode" className="mb-1 block text-sm font-medium">
          One-time code{required ? "" : " (optional)"}
        </label>
        <input
          id="otpCode"
          name="otpCode"
          inputMode="numeric"
          maxLength={6}
          placeholder="••••••"
          className={`w-full rounded-md border px-3 py-2 text-sm ${
            errors?.otpCode ? "border-red-500" : "border-neutral-300"
          }`}
        />
        {errors?.otpCode ? (
          <p className="mt-1 text-xs text-red-600" role="alert">
            {errors.otpCode}
          </p>
        ) : !required ? (
          <p className="mt-1 text-xs text-neutral-500">
            You can verify later from settings, but your site stays out of search results until you
            do.
          </p>
        ) : null}
      </div>
    </div>
  );
}
