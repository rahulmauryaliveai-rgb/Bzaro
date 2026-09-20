"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import {
  requestOtpAction,
  resolveBuyerSessionAction,
  verifyOtpAction,
  type OtpRequestState,
  type OtpVerifyState,
} from "@/server/actions/otp";
import { submitRequirementAction, type RequirementState } from "@/server/actions/requirement";
import { BUYER_CONSENT_TEXT } from "@/lib/validation/otp";
import { PURPOSE_LABELS, QUANTITY_UNITS, TIMELINE_LABELS } from "@/lib/validation/requirement";
import { formatPhone } from "@/lib/buyer/phone";
import { Field, Select, TextArea } from "@/components/dashboard/fields";

/**
 * The contact-intent modal (docs/LEADS.md §1).
 *
 *   phone → otp → requirement → done
 *
 * Opens only when the buyer presses "Enquire on WhatsApp" or "Get Best Price"
 * — never on page load. A buyer with a valid cookie skips straight to the
 * requirement step; the check happens on open, not on render, so the pages
 * that mount this stay cacheable.
 *
 * Each step is a real form posting to a Server Action through
 * `useActionState`, so the flow degrades to full-page posts without
 * JavaScript and validation copy comes from one place.
 *
 * The final step hands off to wa.me. Browsers block `window.open` that is not
 * inside a click handler, so the modal renders the link as a button the buyer
 * presses — and additionally tries to open it once, which works in the
 * browsers that allow it.
 */

export type ContactTarget = {
  /** Absent on the market-only "Post requirement" page. */
  sellerId?: string;
  sellerName?: string;
  /** Set when the buyer is on a product page. */
  productId?: string;
  productName?: string;
  /** Seller's primary category, for seller-level contact. */
  categoryId?: string;
  /** True when the seller has a usable WhatsApp number. */
  sellerHasWhatsApp: boolean;
};

export type CityOption = { id: string; name: string };
export type CategoryOption = { id: string; name: string };

type Step = "checking" | "phone" | "otp" | "requirement";

export function ContactIntentModal({
  open,
  onClose,
  target,
  cities,
  intent,
}: {
  open: boolean;
  onClose: () => void;
  target: ContactTarget;
  cities: CityOption[];
  intent: "whatsapp" | "price";
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Remount the steps on every open so a reopen starts from the cookie check.
  const [session, setSession] = useState(0);

  // Native <dialog>: focus trapping, Escape, and the backdrop come for free.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function handleClose() {
    setSession((n) => n + 1);
    onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={handleClose}
      aria-labelledby="contact-intent-title"
      className="m-auto w-full max-w-md rounded-xl border border-neutral-200 bg-white p-0 shadow-xl backdrop:bg-black/40"
    >
      <div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-5 py-4">
        <div>
          <h2 id="contact-intent-title" className="text-base font-semibold">
            {intent === "price" ? "Get the best price" : "Contact on WhatsApp"}
          </h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            {target.productName ? `${target.productName} · ` : ""}
            {target.sellerName}
          </p>
        </div>
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close"
          className="rounded-md p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
        >
          ×
        </button>
      </div>

      <div className="px-5 py-4">
        {open ? <ContactIntentSteps key={session} target={target} cities={cities} /> : null}
      </div>
    </dialog>
  );
}

/**
 * The step machine, without the dialog chrome. The modal wraps it; the
 * /post-requirement page renders it inline with no seller.
 */
export function ContactIntentSteps({
  target,
  cities,
  categories,
}: {
  target: ContactTarget;
  cities: CityOption[];
  categories?: CategoryOption[];
}) {
  const [step, setStep] = useState<Step>("checking");
  const [phone, setPhone] = useState<string>("");
  const [buyer, setBuyer] = useState<{ name: string | null; locationId: string | null } | null>(
    null,
  );

  // On mount: does this visitor already hold a buyer cookie?
  useEffect(() => {
    let cancelled = false;
    resolveBuyerSessionAction()
      .then((result) => {
        if (cancelled) return;
        if (result.buyer) {
          setBuyer(result.buyer);
          setStep("requirement");
        } else {
          setStep("phone");
        }
      })
      .catch(() => {
        if (!cancelled) setStep("phone");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      {step === "checking" ? (
        <p className="py-6 text-center text-sm text-neutral-500">One moment…</p>
      ) : null}

      {step === "phone" ? (
        <PhoneStep
          onSent={(sentTo) => {
            setPhone(sentTo);
            setStep("otp");
          }}
        />
      ) : null}

      {step === "otp" ? (
        <OtpStep
          phone={phone}
          onVerified={(session) => {
            setBuyer(session);
            setStep("requirement");
          }}
          onChangeNumber={() => setStep("phone")}
        />
      ) : null}

      {step === "requirement" ? (
        <RequirementStep
          target={target}
          cities={cities}
          categories={categories}
          buyer={buyer}
          onSessionLost={() => setStep("phone")}
        />
      ) : null}
    </>
  );
}

// ── Step 1: phone ────────────────────────────────────────────────────────────

function PhoneStep({ onSent }: { onSent: (phone: string) => void }) {
  const [state, action, pending] = useActionState<OtpRequestState, FormData>(requestOtpAction, {});

  useEffect(() => {
    if (state.ok && state.phone) onSent(state.phone);
    // onSent is stable for the life of the modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok, state.phone]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="purpose" value="BUYER_CONTACT" />
      <Honeypot />

      <p className="text-sm text-neutral-700">
        Enter your mobile number. We&apos;ll send a one-time code to confirm it&apos;s you.
      </p>

      <Field
        label="Mobile number"
        name="phone"
        type="tel"
        inputMode="numeric"
        placeholder="98765 43210"
        required
        error={state.fieldErrors?.phone}
      />

      {state.error ? <ErrorText>{state.error}</ErrorText> : null}

      <PrimaryButton pending={pending}>Send code</PrimaryButton>
    </form>
  );
}

// ── Step 2: OTP ──────────────────────────────────────────────────────────────

function OtpStep({
  phone,
  onVerified,
  onChangeNumber,
}: {
  phone: string;
  onVerified: (buyer: { name: string | null; locationId: string | null }) => void;
  onChangeNumber: () => void;
}) {
  const [state, action, pending] = useActionState<OtpVerifyState, FormData>(verifyOtpAction, {});
  const [resend, resendAction, resending] = useActionState<OtpRequestState, FormData>(
    requestOtpAction,
    {},
  );
  // The consent box lives OUTSIDE the form and feeds it through a hidden
  // input. React resets a form once its action settles (`form.reset()`), and
  // because the `checked` prop has not changed React never re-applies it — so
  // a controlled checkbox inside the form would silently untick after every
  // wrong code. Hidden inputs are untouched by a reset.
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    if (state.ok) onVerified(state.buyer ?? { name: null, locationId: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok]);

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <input type="hidden" name="purpose" value="BUYER_CONTACT" />
        <input type="hidden" name="phone" value={phone} />

        <p className="text-sm text-neutral-700">
          We sent a 6-digit code to <span className="font-medium">{formatPhone(phone)}</span>.{" "}
          <button
            type="button"
            onClick={onChangeNumber}
            className="text-teal-700 underline-offset-2 hover:underline"
          >
            Change number
          </button>
        </p>

        <Field
          label="One-time code"
          name="code"
          inputMode="numeric"
          placeholder="••••••"
          maxLength={6}
          required
          error={state.fieldErrors?.code}
        />
        {state.attemptsRemaining !== undefined && state.attemptsRemaining > 0 ? (
          <p className="-mt-2 text-xs text-neutral-500">
            {state.attemptsRemaining} attempt{state.attemptsRemaining === 1 ? "" : "s"} left
          </p>
        ) : null}

        <input type="hidden" name="consent" value={consent ? "on" : ""} />
        {state.fieldErrors?.consent ? <ErrorText>{state.fieldErrors.consent}</ErrorText> : null}

        {state.error ? <ErrorText>{state.error}</ErrorText> : null}

        <PrimaryButton pending={pending}>Verify</PrimaryButton>
      </form>

      <label className="flex items-start gap-2 text-xs text-neutral-700">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.currentTarget.checked)}
          className="mt-0.5"
        />
        <span>{BUYER_CONSENT_TEXT}</span>
      </label>

      <form action={resendAction} className="text-center text-xs text-neutral-500">
        <input type="hidden" name="purpose" value="BUYER_CONTACT" />
        <input type="hidden" name="phone" value={phone} />
        Didn&apos;t get it?{" "}
        <button
          type="submit"
          disabled={resending}
          className="text-teal-700 underline-offset-2 hover:underline disabled:opacity-50"
        >
          {resending ? "Sending…" : resend.ok ? "Sent again" : "Resend code"}
        </button>
        {resend.error ? <ErrorText>{resend.error}</ErrorText> : null}
      </form>
    </div>
  );
}

// ── Step 3: requirement ──────────────────────────────────────────────────────

function RequirementStep({
  target,
  cities,
  categories,
  buyer,
  onSessionLost,
}: {
  target: ContactTarget;
  cities: CityOption[];
  categories?: CategoryOption[];
  buyer: { name: string | null; locationId: string | null } | null;
  onSessionLost: () => void;
}) {
  const [state, action, pending] = useActionState<RequirementState, FormData>(
    submitRequirementAction,
    {},
  );
  const openedRef = useRef(false);

  useEffect(() => {
    if (state.errorKind === "session") onSessionLost();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.errorKind]);

  useEffect(() => {
    if (!state.ok) return;
    if (state.whatsappUrl && !openedRef.current) {
      openedRef.current = true;
      // Best effort; the button below is the reliable path.
      startTransition(() => {
        window.open(state.whatsappUrl, "_blank", "noopener,noreferrer");
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok]);

  if (state.ok) {
    return (
      <div className="space-y-4 py-2 text-center">
        <p className="text-sm text-neutral-700">
          {target.sellerName ? (
            <>
              Your requirement was sent to <span className="font-medium">{target.sellerName}</span>.
            </>
          ) : (
            "Your requirement is posted. Matched suppliers will contact you on the number you verified."
          )}
        </p>
        {state.whatsappUrl ? (
          <a
            href={state.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex items-center justify-center rounded-md bg-[#25D366] px-4 py-2 text-sm font-medium text-white hover:bg-[#1eb855]"
          >
            Continue on WhatsApp
          </a>
        ) : (
          <p className="text-xs text-neutral-500">
            The supplier will get back to you on the number you verified.
          </p>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <Honeypot />
      {target.productId ? <input type="hidden" name="productId" value={target.productId} /> : null}
      {target.sellerId ? <input type="hidden" name="sellerId" value={target.sellerId} /> : null}
      {target.categoryId ? (
        <input type="hidden" name="categoryId" value={target.categoryId} />
      ) : null}

      {!target.sellerId && !target.categoryId && categories ? (
        <Select
          label="Category"
          name="categoryId"
          defaultValue=""
          placeholder="Choose a category"
          options={categories.map((c) => ({ value: c.id, label: c.name }))}
          error={state.fieldErrors?.categoryId}
        />
      ) : null}

      <Field
        label="What do you need?"
        name="productName"
        defaultValue={target.productName ?? ""}
        placeholder="e.g. LED bulb 9W"
        required
        maxLength={200}
        error={state.fieldErrors?.productName}
      />

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Quantity"
          name="quantity"
          type="number"
          inputMode="numeric"
          placeholder="500"
          required
          error={state.fieldErrors?.quantity}
        />
        <Select
          label="Unit"
          name="quantityUnit"
          defaultValue="pieces"
          options={QUANTITY_UNITS.map((unit) => ({ value: unit, label: unit }))}
          error={state.fieldErrors?.quantityUnit}
        />
      </div>

      <Select
        label="Your city"
        name="locationId"
        defaultValue={buyer?.locationId ?? ""}
        placeholder="Choose a city"
        options={cities.map((city) => ({ value: city.id, label: city.name }))}
        error={state.fieldErrors?.locationId}
      />

      <div className="grid grid-cols-2 gap-3">
        <Select
          label="When do you need it?"
          name="timeline"
          defaultValue="WITHIN_WEEK"
          options={Object.entries(TIMELINE_LABELS).map(([value, label]) => ({ value, label }))}
          error={state.fieldErrors?.timeline}
        />
        <Select
          label="Purpose"
          name="purpose"
          defaultValue="BUSINESS_USE"
          options={Object.entries(PURPOSE_LABELS).map(([value, label]) => ({ value, label }))}
          error={state.fieldErrors?.purpose}
        />
      </div>

      <Field
        label="Your name (optional)"
        name="name"
        defaultValue={buyer?.name ?? ""}
        maxLength={120}
        error={state.fieldErrors?.name}
      />

      <TextArea
        label="Anything else? (optional)"
        name="notes"
        rows={2}
        maxLength={1000}
        placeholder="Specifications, delivery needs…"
        error={state.fieldErrors?.notes}
      />

      {state.error ? <ErrorText>{state.error}</ErrorText> : null}

      <PrimaryButton pending={pending}>
        {target.sellerHasWhatsApp ? "Send & open WhatsApp" : "Send requirement"}
      </PrimaryButton>
    </form>
  );
}

// ── Bits ─────────────────────────────────────────────────────────────────────

function Honeypot() {
  // Bots fill every field; humans never see this one.
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
      <label>
        Website <input type="text" name="website" tabIndex={-1} autoComplete="off" />
      </label>
    </div>
  );
}

function PrimaryButton({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
    >
      {pending ? "Please wait…" : children}
    </button>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="text-xs text-red-600">
      {children}
    </p>
  );
}
