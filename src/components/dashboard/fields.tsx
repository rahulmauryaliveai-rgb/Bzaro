"use client";

import type { ReactNode } from "react";

/**
 * Form primitives shared by the catalogue editors.
 *
 * Extracted because the product and service forms are long and would otherwise
 * each carry their own near-identical copies — which is how two forms start
 * reporting validation errors differently.
 *
 * Every control takes an `error` and renders it in the same place, so a field
 * with a problem looks the same wherever it appears.
 */

export function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
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

const inputClass = (error?: string) =>
  `w-full rounded-md border px-3 py-2 text-sm ${error ? "border-red-500" : "border-neutral-300"}`;

function Wrapper({
  label,
  name,
  hint,
  error,
  children,
}: {
  label: string;
  name: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error ? <p className="mt-1 text-xs text-neutral-500">{hint}</p> : null}
      {error ? (
        <p className="mt-1 text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Field({
  label,
  name,
  type = "text",
  defaultValue,
  placeholder,
  required,
  hint,
  maxLength,
  error,
  inputMode,
  autoComplete,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  hint?: string;
  maxLength?: number;
  error?: string;
  inputMode?: "text" | "numeric" | "decimal" | "tel";
  autoComplete?: string;
}) {
  return (
    <Wrapper label={label} name={name} hint={hint} error={error}>
      <input
        id={name}
        name={name}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        required={required}
        maxLength={maxLength}
        placeholder={placeholder}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        className={inputClass(error)}
      />
    </Wrapper>
  );
}

export function TextArea({
  label,
  name,
  defaultValue,
  placeholder,
  rows = 4,
  hint,
  maxLength,
  error,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  rows?: number;
  hint?: string;
  maxLength?: number;
  error?: string;
}) {
  return (
    <Wrapper label={label} name={name} hint={hint} error={error}>
      <textarea
        id={name}
        name={name}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        className={inputClass(error)}
      />
    </Wrapper>
  );
}

export function Select({
  label,
  name,
  defaultValue,
  options,
  hint,
  error,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  options: Array<{ value: string; label: string }>;
  hint?: string;
  error?: string;
  placeholder?: string;
}) {
  return (
    <Wrapper label={label} name={name} hint={hint} error={error}>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue ?? ""}
        aria-invalid={error ? true : undefined}
        className={`${inputClass(error)} bg-white`}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Wrapper>
  );
}

/**
 * The save banner.
 *
 * `awaitingReview` is not an error and must not look like one. A seller whose
 * first listing is queued for moderation (D10) has done nothing wrong, and a
 * red banner would tell them otherwise.
 */
export function SaveBanner({
  error,
  message,
  awaitingReview,
}: {
  error?: string;
  message?: string;
  awaitingReview?: boolean;
}) {
  if (error) {
    return (
      <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
        {error}
      </p>
    );
  }

  if (!message) return null;

  return (
    <p
      role="status"
      className={`rounded-md px-3 py-2 text-sm ${
        awaitingReview ? "bg-amber-50 text-amber-900" : "bg-teal-50 text-teal-900"
      }`}
    >
      {message}
    </p>
  );
}
