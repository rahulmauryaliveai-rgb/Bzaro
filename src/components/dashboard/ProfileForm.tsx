"use client";

import { useActionState, useState } from "react";
import { updateProfileAction, type SellerActionState } from "@/server/actions/seller";
import { ImageUpload } from "@/components/dashboard/ImageUpload";
import { Select } from "@/components/dashboard/fields";
import {
  BUSINESS_TYPES,
  BUSINESS_TYPE_LABELS,
  CERTIFICATIONS,
  EMPLOYEE_BANDS,
  TURNOVER_BANDS,
} from "@/lib/validation/onboarding";

/**
 * Business profile editor.
 *
 * ── Why the description field gets a live counter ────────────────────────────
 * Description length is the single heaviest item in the D2 eligibility gate
 * (20 of 100 points, with a 150-character minimum). A seller who types 140
 * characters, saves, and then discovers on the dashboard that they are still
 * blocked has been sent round a loop for no reason. The counter turns that into
 * something they can see while typing.
 */

const INITIAL: SellerActionState = {};

type Profile = {
  businessName: string;
  legalName: string | null;
  tagline: string | null;
  description: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  locationId: string | null;
  establishedYear: number | null;
  employeeCount: string | null;
  businessType: string | null;
  annualTurnover: string | null;
  certifications: string[];
  servesLocationIds: string[];
  gstin: string | null;
  socialLinks: Record<string, string>;
};

export function ProfileForm({
  profile,
  locations,
  minDescriptionLength,
}: {
  profile: Profile;
  locations: Array<{ id: string; name: string; parent: { name: string } | null }>;
  minDescriptionLength: number;
}) {
  const [state, action, pending] = useActionState(updateProfileAction, INITIAL);

  // Held in state so an upload can replace them without a page round trip.
  // Both still submit as ordinary fields, so pasting a link keeps working.
  const [logoUrl, setLogoUrl] = useState(profile.logoUrl ?? "");
  const [coverUrl, setCoverUrl] = useState(profile.coverImageUrl ?? "");

  return (
    <form action={action} className="space-y-8">
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

      <Section title="Business">
        <Field
          label="Business name"
          name="businessName"
          defaultValue={profile.businessName}
          required
          error={state.fieldErrors?.businessName}
        />
        <Field
          label="Legal name"
          name="legalName"
          defaultValue={profile.legalName ?? ""}
          hint="If it differs from your trading name."
          error={state.fieldErrors?.legalName}
        />
        <Field
          label="Tagline"
          name="tagline"
          defaultValue={profile.tagline ?? ""}
          hint="One line, shown under your business name."
          maxLength={160}
          error={state.fieldErrors?.tagline}
        />

        <DescriptionField
          defaultValue={profile.description ?? ""}
          minLength={minDescriptionLength}
          error={state.fieldErrors?.description}
        />
      </Section>

      <Section title="Contact">
        <Field
          label="Email"
          name="email"
          type="email"
          defaultValue={profile.email ?? ""}
          error={state.fieldErrors?.email}
        />
        <Field
          label="Phone"
          name="phone"
          type="tel"
          defaultValue={profile.phone ?? ""}
          error={state.fieldErrors?.phone}
        />
        <Field
          label="WhatsApp"
          name="whatsapp"
          type="tel"
          defaultValue={profile.whatsapp ?? ""}
          hint="With country code, e.g. +919876543210. Powers your WhatsApp buttons."
          error={state.fieldErrors?.whatsapp}
        />
        <Field
          label="Existing website"
          name="websiteUrl"
          type="url"
          defaultValue={profile.websiteUrl ?? ""}
          error={state.fieldErrors?.websiteUrl}
        />
      </Section>

      <Section title="Address">
        <Field
          label="Address line 1"
          name="addressLine1"
          defaultValue={profile.addressLine1 ?? ""}
          error={state.fieldErrors?.addressLine1}
        />
        <Field
          label="Address line 2"
          name="addressLine2"
          defaultValue={profile.addressLine2 ?? ""}
          error={state.fieldErrors?.addressLine2}
        />
        <Field
          label="Postal code"
          name="postalCode"
          defaultValue={profile.postalCode ?? ""}
          error={state.fieldErrors?.postalCode}
        />

        <div>
          <label htmlFor="locationId" className="mb-1 block text-sm font-medium">
            City
          </label>
          <select
            id="locationId"
            name="locationId"
            defaultValue={profile.locationId ?? ""}
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">Not set</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
                {location.parent ? `, ${location.parent.name}` : ""}
              </option>
            ))}
          </select>
        </div>
      </Section>

      {/*
        A logo or cover image is one of the D2 eligibility requirements, so this
        section is a direct route out of "hidden from search engines" — which is
        why it is an upload now rather than a request to go and find a URL.
      */}
      <Section title="Branding">
        <ImageUpload
          target="logo"
          label="Logo"
          value={logoUrl}
          hint="Square works best. JPG, PNG or WebP, up to 2 MB."
          onChange={(asset) => setLogoUrl(asset?.url ?? "")}
        />
        {state.fieldErrors?.logoUrl ? (
          <p className="text-xs text-red-600">{state.fieldErrors.logoUrl}</p>
        ) : null}

        <ImageUpload
          target="cover"
          label="Cover image"
          value={coverUrl}
          hint="Wide banner shown across the top of your website."
          onChange={(asset) => setCoverUrl(asset?.url ?? "")}
        />
        {state.fieldErrors?.coverImageUrl ? (
          <p className="text-xs text-red-600">{state.fieldErrors.coverImageUrl}</p>
        ) : null}

        {/*
          These are the canonical fields, not a mirror of the uploads above.
          Naming them here keeps the profile editable without JavaScript.
        */}
        <details open={Boolean(logoUrl || coverUrl)}>
          <summary className="cursor-pointer text-xs text-neutral-500">
            Or paste image links
          </summary>
          <div className="mt-2 space-y-2">
            <input
              type="text"
              inputMode="url"
              name="logoUrl"
              value={logoUrl}
              onChange={(event) => setLogoUrl(event.currentTarget.value)}
              placeholder="Logo URL"
              maxLength={2048}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
            <input
              type="text"
              inputMode="url"
              name="coverImageUrl"
              value={coverUrl}
              onChange={(event) => setCoverUrl(event.currentTarget.value)}
              placeholder="Cover image URL"
              maxLength={2048}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
        </details>
      </Section>

      <Section title="Business details">
        <Field
          label="Established year"
          name="establishedYear"
          type="number"
          defaultValue={profile.establishedYear?.toString() ?? ""}
          error={state.fieldErrors?.establishedYear}
        />
        <Select
          label="Business type"
          name="businessType"
          defaultValue={profile.businessType ?? ""}
          placeholder="Choose…"
          options={BUSINESS_TYPES.map((type) => ({
            value: type,
            label: BUSINESS_TYPE_LABELS[type],
          }))}
          error={state.fieldErrors?.businessType}
        />
        <Select
          label="Team size"
          name="employeeCount"
          defaultValue={profile.employeeCount ?? ""}
          placeholder="Choose…"
          options={EMPLOYEE_BANDS.map((band) => ({ value: band, label: band }))}
          error={state.fieldErrors?.employeeCount}
        />
        <Select
          label="Annual turnover"
          name="annualTurnover"
          defaultValue={profile.annualTurnover ?? ""}
          placeholder="Choose…"
          options={TURNOVER_BANDS.map((band) => ({ value: band, label: band }))}
          error={state.fieldErrors?.annualTurnover}
        />
        <Field
          label="GSTIN"
          name="gstin"
          defaultValue={profile.gstin ?? ""}
          hint="15 characters. Shown publicly as a trust signal."
          error={state.fieldErrors?.gstin}
        />
      </Section>

      <Section title="Certifications" hint="Shown on your listing and your website.">
        <div className="grid gap-1.5 sm:grid-cols-2">
          {CERTIFICATIONS.map((certification) => (
            <label key={certification} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="certifications"
                value={certification}
                defaultChecked={profile.certifications.includes(certification)}
              />
              <span>{certification}</span>
            </label>
          ))}
        </div>
      </Section>

      <Section
        title="Cities you serve"
        hint="Besides your own city. Buyers there see you in listings and their requirements can reach you."
      >
        <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-md border border-neutral-200 p-3">
          {locations
            .filter((location) => location.id !== profile.locationId)
            .map((location) => (
              <label key={location.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="servesLocationIds"
                  value={location.id}
                  defaultChecked={profile.servesLocationIds.includes(location.id)}
                />
                <span>
                  {location.name}
                  {location.parent ? (
                    <span className="text-neutral-500">, {location.parent.name}</span>
                  ) : null}
                </span>
              </label>
            ))}
        </div>
        {state.fieldErrors?.servesLocationIds ? (
          <p className="text-xs text-red-600">{state.fieldErrors.servesLocationIds}</p>
        ) : null}
      </Section>

      <Section title="Social links">
        {(["facebook", "instagram", "linkedin", "youtube", "x"] as const).map((key) => (
          <Field
            key={key}
            label={key === "x" ? "X" : key.charAt(0).toUpperCase() + key.slice(1)}
            name={key}
            type="url"
            defaultValue={profile.socialLinks[key] ?? ""}
            error={state.fieldErrors?.[key]}
          />
        ))}
      </Section>

      <div className="sticky bottom-0 -mx-4 border-t border-neutral-200 bg-white px-4 py-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save profile"}
        </button>
      </div>
    </form>
  );
}

/**
 * Description with a live counter against the eligibility threshold.
 *
 * Uncontrolled with an `onInput` handler rather than controlled state: this
 * field holds up to 5000 characters, and re-rendering the whole form on every
 * keystroke to update a number is wasteful.
 */
function DescriptionField({
  defaultValue,
  minLength,
  error,
}: {
  defaultValue: string;
  minLength: number;
  error?: string;
}) {
  return (
    <div>
      <label htmlFor="description" className="mb-1 block text-sm font-medium">
        About your business
      </label>
      <textarea
        id="description"
        name="description"
        rows={7}
        maxLength={5000}
        defaultValue={defaultValue}
        placeholder="What you make or supply, who you serve, what makes you different, certifications, capacity…"
        onInput={(event) => {
          const counter = document.getElementById("description-count");
          if (!counter) return;
          const length = event.currentTarget.value.trim().length;
          counter.textContent =
            length >= minLength
              ? `${length} characters — meets the minimum`
              : `${length} of ${minLength} characters minimum`;
          counter.className =
            length >= minLength ? "mt-1 text-xs text-teal-700" : "mt-1 text-xs text-amber-700";
        }}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />
      <p
        id="description-count"
        className={
          defaultValue.trim().length >= minLength
            ? "mt-1 text-xs text-teal-700"
            : "mt-1 text-xs text-amber-700"
        }
      >
        {defaultValue.trim().length >= minLength
          ? `${defaultValue.trim().length} characters — meets the minimum`
          : `${defaultValue.trim().length} of ${minLength} characters minimum`}
      </p>
      <p className="mt-1 text-xs text-neutral-500">
        This is the biggest factor in whether search engines will index your site.
      </p>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="rounded-lg border border-neutral-200 bg-white p-5">
      <legend className="px-2 text-sm font-semibold tracking-wide text-neutral-500 uppercase">
        {title}
      </legend>
      {hint ? <p className="mb-4 text-xs text-neutral-500">{hint}</p> : null}
      <div className="space-y-4">{children}</div>
    </fieldset>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  required,
  hint,
  maxLength,
  error,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
  hint?: string;
  maxLength?: number;
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
        type={type}
        required={required}
        maxLength={maxLength}
        defaultValue={defaultValue}
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
