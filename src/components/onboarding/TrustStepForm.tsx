"use client";

import { useActionState, useState } from "react";
import {
  saveTrustStepAction,
  skipTrustStepAction,
  type OnboardingState,
} from "@/server/actions/onboarding";
import { CERTIFICATIONS, EMPLOYEE_BANDS, TURNOVER_BANDS } from "@/lib/validation/onboarding";
import { Field, Select } from "@/components/dashboard/fields";
import { ImageUpload } from "@/components/dashboard/ImageUpload";

/**
 * Onboarding step 3. Every field optional; "Skip for now" is a separate form
 * so it works without JavaScript and cannot be confused with a save.
 */
export function TrustStepForm({
  values,
}: {
  values: {
    businessName: string;
    gstin: string | null;
    establishedYear: number | null;
    employeeCount: string | null;
    annualTurnover: string | null;
    logoUrl: string | null;
    certifications: string[];
  } | null;
}) {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(
    saveTrustStepAction,
    {},
  );
  const [logoUrl, setLogoUrl] = useState(values?.logoUrl ?? "");
  const thisYear = new Date().getFullYear();

  return (
    <div className="space-y-6">
      <form action={action} className="space-y-5">
        {state.error ? (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {state.error}
          </p>
        ) : null}

        <Field
          label="GSTIN"
          name="gstin"
          defaultValue={values?.gstin ?? ""}
          placeholder="27ABCDE1234F1Z5"
          maxLength={15}
          hint="Shown as a verified badge once our team checks it."
          error={state.fieldErrors?.gstin}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Year established"
            name="establishedYear"
            type="number"
            inputMode="numeric"
            defaultValue={values?.establishedYear ? String(values.establishedYear) : ""}
            placeholder={String(thisYear - 5)}
            error={state.fieldErrors?.establishedYear}
          />
          <Select
            label="Employees"
            name="employeeCount"
            defaultValue={values?.employeeCount ?? ""}
            placeholder="Choose…"
            options={EMPLOYEE_BANDS.map((band) => ({ value: band, label: band }))}
            error={state.fieldErrors?.employeeCount}
          />
          <Select
            label="Annual turnover"
            name="annualTurnover"
            defaultValue={values?.annualTurnover ?? ""}
            placeholder="Choose…"
            options={TURNOVER_BANDS.map((band) => ({ value: band, label: band }))}
            error={state.fieldErrors?.annualTurnover}
          />
        </div>

        <div className="space-y-2">
          <ImageUpload
            target="logo"
            label="Logo"
            value={logoUrl}
            hint="Square works best. JPG, PNG or WebP, up to 2 MB."
            onChange={(asset) => setLogoUrl(asset?.url ?? "")}
          />
          <input type="hidden" name="logoUrl" value={logoUrl} />
          {state.fieldErrors?.logoUrl ? (
            <p className="text-xs text-red-600">{state.fieldErrors.logoUrl}</p>
          ) : null}
          <p className="text-xs text-neutral-500">
            Photos of your premises and products go in the gallery, from your dashboard.
          </p>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">Certifications</legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {CERTIFICATIONS.map((certification) => (
              <label key={certification} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="certifications"
                  value={certification}
                  defaultChecked={values?.certifications.includes(certification) ?? false}
                />
                <span>{certification}</span>
              </label>
            ))}
          </div>
          {state.fieldErrors?.certifications ? (
            <p className="mt-1 text-xs text-red-600">{state.fieldErrors.certifications}</p>
          ) : null}
        </fieldset>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save and continue"}
        </button>
      </form>

      <form action={skipTrustStepAction} className="text-center">
        <button
          type="submit"
          className="text-sm text-neutral-500 underline-offset-2 hover:underline"
        >
          Skip for now
        </button>
      </form>
    </div>
  );
}
