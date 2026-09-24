"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import {
  buyerGoogleSignInAction,
  buyerLoginAction,
  buyerSignupAction,
  requestBuyerPasswordResetAction,
  resendBuyerCodeAction,
  resetBuyerPasswordAction,
  verifyBuyerEmailAction,
  type BuyerAuthState,
} from "@/server/actions/buyer";
import { Field } from "@/components/dashboard/fields";
import { Turnstile } from "@/components/buyer/Turnstile";

/**
 * Buyer sign-up / sign-in (D35).
 *
 * Used standalone on /login and /register, and inline inside the contact modal
 * so a buyer never loses a half-filled requirement to a page navigation.
 *
 * Every step is a real form posting to a Server Action through
 * `useActionState`, so it degrades to full-page posts without JavaScript and
 * the validation copy comes from one place.
 */

export type AuthView = "signup" | "login" | "otp" | "forgot" | "reset";

export function BuyerAuth({
  initialView = "signup",
  onDone,
}: {
  initialView?: AuthView;
  /** Called once the buyer is authenticated. The modal resumes its flow. */
  onDone?: () => void;
}) {
  const [view, setView] = useState<AuthView>(initialView);
  const [email, setEmail] = useState("");

  return (
    <div>
      {view === "signup" ? (
        <SignupForm
          onSent={(sentTo) => {
            setEmail(sentTo);
            setView("otp");
          }}
          onSwitchToLogin={() => setView("login")}
        />
      ) : null}

      {view === "login" ? (
        <LoginForm
          onDone={onDone}
          onSwitchToSignup={() => setView("signup")}
          onForgot={() => setView("forgot")}
        />
      ) : null}

      {view === "otp" ? <OtpForm email={email} onDone={onDone} /> : null}

      {view === "forgot" ? (
        <ForgotForm
          onSent={(sentTo) => {
            setEmail(sentTo);
            setView("reset");
          }}
          onBack={() => setView("login")}
        />
      ) : null}

      {view === "reset" ? <ResetForm email={email} onDone={() => setView("login")} /> : null}
    </div>
  );
}

function SignupForm({
  onSent,
  onSwitchToLogin,
}: {
  onSent: (email: string) => void;
  onSwitchToLogin: () => void;
}) {
  const [state, action, pending] = useActionState<BuyerAuthState, FormData>(buyerSignupAction, {});

  useEffect(() => {
    if (state.step === "otp" && state.email) onSent(state.email);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.step, state.email]);

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <div>
          <h3 className="text-base font-semibold text-neutral-900">Create your account</h3>
          <p className="mt-1 text-sm text-neutral-600">
            Sellers reply to you here, so we need a way to reach you.
          </p>
        </div>

        <Field
          label="Your name"
          name="name"
          required
          maxLength={120}
          error={state.fieldErrors?.name}
        />
        <Field
          label="Email"
          name="email"
          type="email"
          required
          maxLength={254}
          error={state.fieldErrors?.email}
        />
        <Field
          label="Mobile number"
          name="phone"
          type="tel"
          required
          placeholder="+919876543210"
          hint="Sellers call or WhatsApp you on this number."
          error={state.fieldErrors?.phone}
        />
        <Field
          label="Password"
          name="password"
          type="password"
          required
          hint="At least 10 characters."
          error={state.fieldErrors?.password}
        />

        <label className="flex items-start gap-2 text-sm text-neutral-700">
          <input type="checkbox" name="acceptTerms" className="mt-1 h-4 w-4" />
          <span>
            I accept the{" "}
            <Link href="/terms" className="underline hover:text-neutral-900">
              terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline hover:text-neutral-900">
              privacy policy
            </Link>
            .
          </span>
        </label>
        {state.fieldErrors?.acceptTerms ? (
          <ErrorText>{state.fieldErrors.acceptTerms}</ErrorText>
        ) : null}

        <Turnstile />

        {state.error ? <ErrorText>{state.error}</ErrorText> : null}

        <SubmitButton pending={pending}>Create account</SubmitButton>
      </form>

      {/* Outside the credentials form: a <form> nested in a <form> is invalid
          HTML, and React refuses the inner submit ("A React form was
          unexpectedly submitted"), so Google sign-in silently did nothing. */}
      <GoogleButton />

      <p className="text-center text-sm text-neutral-600">
        Already have an account?{" "}
        <button
          type="button"
          onClick={onSwitchToLogin}
          className="underline hover:text-neutral-900"
        >
          Sign in
        </button>
      </p>
    </div>
  );
}

function LoginForm({
  onDone,
  onSwitchToSignup,
  onForgot,
}: {
  onDone?: () => void;
  onSwitchToSignup: () => void;
  onForgot: () => void;
}) {
  const [state, action, pending] = useActionState<BuyerAuthState, FormData>(buyerLoginAction, {});

  useEffect(() => {
    if (state.step === "done") onDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.step]);

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <h3 className="text-base font-semibold text-neutral-900">Sign in</h3>

        <Field label="Email" name="email" type="email" required maxLength={254} />
        <Field label="Password" name="password" type="password" required />

        {state.error ? <ErrorText>{state.error}</ErrorText> : null}

        <SubmitButton pending={pending}>Sign in</SubmitButton>
      </form>

      {/* Outside the credentials form — see SignupForm. */}
      <GoogleButton />

      <div className="flex items-center justify-between text-sm text-neutral-600">
        <button type="button" onClick={onForgot} className="underline hover:text-neutral-900">
          Forgot password?
        </button>
        <button
          type="button"
          onClick={onSwitchToSignup}
          className="underline hover:text-neutral-900"
        >
          Create account
        </button>
      </div>
    </div>
  );
}

function OtpForm({ email, onDone }: { email: string; onDone?: () => void }) {
  const [state, action, pending] = useActionState<BuyerAuthState, FormData>(
    verifyBuyerEmailAction,
    {},
  );
  const [resendState, resendAction, resending] = useActionState<BuyerAuthState, FormData>(
    resendBuyerCodeAction,
    {},
  );

  useEffect(() => {
    if (state.step === "done") onDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.step]);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-neutral-900">Enter your code</h3>
        <p className="mt-1 text-sm text-neutral-600">
          We sent a 6-digit code to <span className="font-medium">{email}</span>. It expires in 10
          minutes — check your spam folder if it isn&apos;t there.
        </p>
      </div>

      <form action={action} className="space-y-4">
        <input type="hidden" name="email" value={email} />
        <Field
          label="6-digit code"
          name="code"
          inputMode="numeric"
          maxLength={6}
          required
          error={state.fieldErrors?.code}
        />

        {state.error ? <ErrorText>{state.error}</ErrorText> : null}
        {state.attemptsRemaining !== undefined && state.attemptsRemaining > 0 ? (
          <p className="text-xs text-neutral-500">
            {state.attemptsRemaining} attempt{state.attemptsRemaining === 1 ? "" : "s"} left.
          </p>
        ) : null}

        <SubmitButton pending={pending}>Verify</SubmitButton>
      </form>

      <form action={resendAction}>
        <input type="hidden" name="email" value={email} />
        <button
          type="submit"
          disabled={resending}
          className="min-h-11 text-sm text-neutral-600 underline hover:text-neutral-900 disabled:opacity-50"
        >
          {resending ? "Sending…" : "Send a new code"}
        </button>
        {resendState.error ? <ErrorText>{resendState.error}</ErrorText> : null}
      </form>
    </div>
  );
}

function ForgotForm({ onSent, onBack }: { onSent: (email: string) => void; onBack: () => void }) {
  const [state, action, pending] = useActionState<BuyerAuthState, FormData>(
    requestBuyerPasswordResetAction,
    {},
  );

  useEffect(() => {
    if (state.step === "otp" && state.email) onSent(state.email);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.step, state.email]);

  return (
    <form action={action} className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-neutral-900">Reset your password</h3>
        <p className="mt-1 text-sm text-neutral-600">
          We&apos;ll email you a code if that address has an account.
        </p>
      </div>

      <Field
        label="Email"
        name="email"
        type="email"
        required
        maxLength={254}
        error={state.fieldErrors?.email}
      />

      {state.error ? <ErrorText>{state.error}</ErrorText> : null}

      <SubmitButton pending={pending}>Send code</SubmitButton>

      <button
        type="button"
        onClick={onBack}
        className="min-h-11 w-full text-sm text-neutral-600 underline hover:text-neutral-900"
      >
        Back to sign in
      </button>
    </form>
  );
}

function ResetForm({ email, onDone }: { email: string; onDone: () => void }) {
  const [state, action, pending] = useActionState<BuyerAuthState, FormData>(
    resetBuyerPasswordAction,
    {},
  );

  useEffect(() => {
    if (state.step === "done") onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.step]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="email" value={email} />
      <div>
        <h3 className="text-base font-semibold text-neutral-900">Choose a new password</h3>
        <p className="mt-1 text-sm text-neutral-600">
          Enter the code we sent to <span className="font-medium">{email}</span>.
        </p>
      </div>

      <Field
        label="6-digit code"
        name="code"
        inputMode="numeric"
        maxLength={6}
        required
        error={state.fieldErrors?.code}
      />
      <Field
        label="New password"
        name="password"
        type="password"
        required
        hint="At least 10 characters."
        error={state.fieldErrors?.password}
      />
      <Field
        label="Confirm password"
        name="confirmPassword"
        type="password"
        required
        error={state.fieldErrors?.confirmPassword}
      />

      {state.error ? <ErrorText>{state.error}</ErrorText> : null}

      <SubmitButton pending={pending}>Set new password</SubmitButton>
    </form>
  );
}

/**
 * Its own form: nesting a second submit inside the credentials form would post
 * the credentials when the buyer meant to use Google.
 */
function GoogleButton() {
  return (
    <form action={buyerGoogleSignInAction}>
      <button
        type="submit"
        className="min-h-11 w-full rounded-md border border-neutral-300 px-4 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
      >
        Continue with Google
      </button>
    </form>
  );
}

function SubmitButton({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-11 w-full rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
    >
      {pending ? "Please wait…" : children}
    </button>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm text-red-600" role="alert">
      {children}
    </p>
  );
}
