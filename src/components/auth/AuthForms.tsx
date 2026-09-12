"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  loginAction,
  registerAction,
  requestPasswordResetAction,
  resetPasswordAction,
  type ActionState,
} from "@/server/actions/auth";

/**
 * Authentication forms.
 *
 * Client components only because they need `useActionState` for pending state
 * and inline errors. The underlying Server Actions are the real boundary and
 * validate independently — these forms are a UX layer, not a security one.
 *
 * Every field is a real `<input name>` inside a `<form action>`, so submission
 * works before hydration completes. Only the error rendering needs JavaScript.
 */

const INITIAL: ActionState = {};

const inputClass =
  "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus-visible:border-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-900/10";

function Field({
  label,
  name,
  type = "text",
  error,
  autoComplete,
  required = true,
  defaultValue,
  hint,
}: {
  label: string;
  name: string;
  type?: string;
  error?: string;
  autoComplete?: string;
  required?: boolean;
  defaultValue?: string;
  hint?: string;
}) {
  const id = `field-${name}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-neutral-800">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={`${inputClass} ${error ? "border-red-500" : ""}`}
      />
      {hint && !error ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-neutral-500">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function SubmitButton({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60"
    >
      {pending ? "Working…" : children}
    </button>
  );
}

function FormError({ state }: { state: ActionState }) {
  if (!state.error) return null;
  return (
    <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
      {state.error}
    </p>
  );
}

function FormSuccess({ state }: { state: ActionState }) {
  if (!state.ok || !state.message) return null;
  return (
    <p role="status" className="rounded-md bg-teal-50 px-3 py-2 text-sm text-teal-800">
      {state.message}
    </p>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(loginAction, INITIAL);

  return (
    <form action={action} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <FormError state={state} />

      <Field label="Email" name="email" type="email" autoComplete="email" />
      <Field label="Password" name="password" type="password" autoComplete="current-password" />

      <SubmitButton pending={pending}>Sign in</SubmitButton>

      <div className="flex justify-between text-sm">
        <Link href="/forgot-password" className="text-neutral-600 hover:text-neutral-900">
          Forgot password?
        </Link>
        <Link href="/register" className="text-neutral-600 hover:text-neutral-900">
          Create an account
        </Link>
      </div>
    </form>
  );
}

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, INITIAL);

  if (state.ok) {
    return (
      <div className="space-y-3">
        <FormSuccess state={state} />
        <p className="text-sm text-neutral-600">
          Once confirmed, you can{" "}
          <Link href="/login" className="underline underline-offset-2">
            sign in
          </Link>{" "}
          and register your business.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <FormError state={state} />

      <Field label="Your name" name="name" autoComplete="name" error={state.fieldErrors?.name} />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        error={state.fieldErrors?.email}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        error={state.fieldErrors?.password}
        hint="At least 10 characters. Length beats symbols."
      />
      <Field
        label="Confirm password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        error={state.fieldErrors?.confirmPassword}
      />

      <label className="flex items-start gap-2 text-sm text-neutral-700">
        <input type="checkbox" name="acceptTerms" className="mt-0.5" />
        <span>
          I accept the terms of service and privacy policy.
          {state.fieldErrors?.acceptTerms ? (
            <span className="block text-xs text-red-600">{state.fieldErrors.acceptTerms}</span>
          ) : null}
        </span>
      </label>

      <SubmitButton pending={pending}>Create account</SubmitButton>

      <p className="text-center text-sm text-neutral-600">
        Already registered?{" "}
        <Link href="/login" className="underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordResetAction, INITIAL);

  return (
    <form action={action} className="space-y-4">
      <FormError state={state} />
      <FormSuccess state={state} />

      {!state.ok ? (
        <>
          <Field
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            error={state.fieldErrors?.email}
          />
          <SubmitButton pending={pending}>Send reset link</SubmitButton>
        </>
      ) : null}

      <p className="text-center text-sm text-neutral-600">
        <Link href="/login" className="underline underline-offset-2">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, INITIAL);

  if (state.ok) {
    return (
      <div className="space-y-3">
        <FormSuccess state={state} />
        <Link
          href="/login"
          className="block w-full rounded-md bg-neutral-900 px-4 py-2.5 text-center text-sm font-medium text-white"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      <FormError state={state} />

      <Field
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        error={state.fieldErrors?.password}
        hint="At least 10 characters."
      />
      <Field
        label="Confirm new password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        error={state.fieldErrors?.confirmPassword}
      />

      <SubmitButton pending={pending}>Update password</SubmitButton>
    </form>
  );
}
