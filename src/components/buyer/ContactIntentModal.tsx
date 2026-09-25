"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { resolveBuyerSessionAction } from "@/server/actions/buyer";
import { submitRequirementAction, type RequirementState } from "@/server/actions/requirement";
import { CONSENT_TEXT } from "@/lib/consent";
import { BuyerAuth } from "@/components/buyer/AuthModal";
import { PURPOSE_LABELS, QUANTITY_UNITS, TIMELINE_LABELS } from "@/lib/validation/requirement";
import { Field, Select, TextArea } from "@/components/dashboard/fields";
import {
  clearPendingRequirement,
  loadPendingRequirement,
  savePendingRequirement,
  type PendingRequirement,
} from "@/lib/buyer/pending-requirement";

/**
 * The contact-intent modal (docs/LEADS.md §1).
 *
 *   requirement → (sign in, if needed) → done
 *
 * Opens only when the buyer presses "Enquire on WhatsApp" or "Get Best Price"
 * — never on page load. A signed-in buyer goes straight to the requirement
 * step; the check happens on open, not on render, so the pages that mount this
 * stay cacheable.
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
  /** True when the seller has a phone to reveal after a CALL requirement. */
  sellerHasPhone?: boolean;
};

export type CityOption = { id: string; name: string };
export type CategoryOption = { id: string; name: string };

/**
 * Values carried over from a previous requirement ("Re-post"). Only the parts
 * worth retyping — never the consent, which is given afresh each time.
 */
export type RequirementPrefill = {
  productName?: string;
  quantity?: number;
  quantityUnit?: string;
  categoryId?: string;
  locationId?: string;
  timeline?: string;
  purpose?: string;
  notes?: string;
  /** Only when resuming an unsent draft; a re-post uses the account name. */
  name?: string;
};

/** Which trigger the buyer pressed. Recorded on the Requirement. */
export type ContactIntentKind = "whatsapp" | "price" | "call";

const TRIGGER_BY_INTENT = {
  whatsapp: "WHATSAPP",
  price: "ENQUIRY",
  call: "CALL",
} as const;

type Step = "checking" | "signin" | "requirement";

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
  intent: ContactIntentKind;
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
            {intent === "price"
              ? "Get the best price"
              : intent === "call"
                ? "Get the seller's number"
                : "Contact on WhatsApp"}
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
        {open ? (
          <ContactIntentSteps key={session} target={target} cities={cities} intent={intent} />
        ) : null}
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
  intent = "price",
  prefill,
  resume = false,
}: {
  target: ContactTarget;
  cities: CityOption[];
  categories?: CategoryOption[];
  intent?: ContactIntentKind;
  prefill?: RequirementPrefill;
  /** Back from "Continue with Google": offer the unsent draft, if one is kept. */
  resume?: boolean;
}) {
  const [step, setStep] = useState<Step>("checking");
  const [buyer, setBuyer] = useState<{ name: string | null; locationId: string | null } | null>(
    null,
  );
  /**
   * The requirement the buyer tried to send before we asked them to sign in.
   * Held here rather than in the form, which unmounts while the auth step is
   * shown — losing it would mean retyping everything after verifying an email.
   */
  const [draft, setDraft] = useState<FormData | null>(null);
  /** The unsent requirement recovered after the Google round-trip. */
  const [resumed, setResumed] = useState<PendingRequirement | null>(null);

  // On mount: is anyone signed in? Either way the buyer fills the requirement
  // first — signing in is the step between "Send" and the lead.
  useEffect(() => {
    let cancelled = false;
    const pending = resume ? loadPendingRequirement() : null;
    resolveBuyerSessionAction()
      .then((result) => {
        if (cancelled) return;
        if (result.buyer) setBuyer(result.buyer);
        if (pending) setResumed(pending);
        setStep("requirement");
      })
      .catch(() => {
        if (cancelled) return;
        if (pending) setResumed(pending);
        setStep("requirement");
      });
    return () => {
      cancelled = true;
    };
  }, [resume]);

  return (
    <>
      {step === "checking" ? (
        <p className="py-6 text-center text-sm text-neutral-500">One moment…</p>
      ) : null}

      {step === "signin" ? <SignInStep onAuthenticated={() => setStep("requirement")} /> : null}

      {step === "requirement" ? (
        <RequirementStep
          // Resuming restores the original seller/product context too, so the
          // hidden fields — and the DIRECT lead — match what the buyer started.
          target={resumed?.target ?? target}
          cities={cities}
          categories={categories}
          buyer={buyer}
          draft={draft}
          onDraft={setDraft}
          intent={resumed?.intent ?? intent}
          prefill={resumed ? prefillFromFields(resumed.fields) : prefill}
          resumed={resumed !== null}
          onSessionLost={() => setStep("signin")}
        />
      ) : null}
    </>
  );
}

/**
 * Shown when submitting without an account. The requirement form stays mounted
 * behind this step and its draft is held in sessionStorage, so verifying an
 * email returns the buyer to a filled form rather than an empty one.
 */
function SignInStep({ onAuthenticated }: { onAuthenticated: () => void }) {
  return (
    <div className="py-1">
      <p className="mb-4 text-sm text-neutral-600">
        Your requirement is ready to send. Create an account so sellers can reply to you.
      </p>
      <BuyerAuth initialView="signup" onDone={onAuthenticated} />
    </div>
  );
}

// ── Requirement form ─────────────────────────────────────────────────────────

function RequirementStep({
  target,
  cities,
  categories,
  buyer,
  draft,
  onDraft,
  intent,
  prefill,
  resumed,
  onSessionLost,
}: {
  target: ContactTarget;
  cities: CityOption[];
  categories?: CategoryOption[];
  buyer: { name: string | null; locationId: string | null } | null;
  draft: FormData | null;
  onDraft: (draft: FormData) => void;
  intent: ContactIntentKind;
  prefill?: RequirementPrefill;
  resumed: boolean;
  onSessionLost: () => void;
}) {
  const [state, action, pending] = useActionState<RequirementState, FormData>(
    submitRequirementAction,
    {},
  );
  const openedRef = useRef(false);
  /**
   * True means "no auto-submit". Seeded from whether a draft already existed at
   * mount: this step unmounts while the auth step shows, so a draft present on
   * mount means the buyer is coming back from signing in. A draft that appears
   * later is just this form's own submission and must not be sent twice.
   */
  const resubmittedRef = useRef(draft === null);

  useEffect(() => {
    if (state.errorKind === "session") onSessionLost();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.errorKind]);

  // Returning from the auth step: send the requirement they already filled in
  // rather than making them press Send a second time.
  useEffect(() => {
    if (!draft || resubmittedRef.current) return;
    resubmittedRef.current = true;
    startTransition(() => action(draft));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  useEffect(() => {
    if (!state.ok) return;
    clearPendingRequirement();
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
            "Your requirement is posted. Matched suppliers will contact you on the number on your account."
          )}
        </p>

        {state.sellerPhone ? (
          <a
            href={`tel:${state.sellerPhone}`}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Call {state.sellerPhone}
          </a>
        ) : null}

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
    <form
      action={(formData) => {
        // Kept so an unauthenticated submit can be replayed after sign-up —
        // in memory for email sign-up, in sessionStorage for the Google
        // round-trip, which reloads the page. Cleared once sent.
        onDraft(formData);
        savePendingRequirement(formData, target, intent);
        return action(formData);
      }}
      className="space-y-4"
    >
      <Honeypot />
      {resumed ? (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-900" role="status">
          You&apos;re signed in. Your requirement is ready — check the details and press send.
        </p>
      ) : null}
      <input
        type="hidden"
        name="trigger"
        value={target.sellerId ? TRIGGER_BY_INTENT[intent] : "SEARCH_CARD"}
      />
      <input
        type="hidden"
        name="source"
        value={target.sellerId ? "STOREFRONT" : "BZARO_MARKETPLACE"}
      />
      {target.productId ? <input type="hidden" name="productId" value={target.productId} /> : null}
      {target.sellerId ? <input type="hidden" name="sellerId" value={target.sellerId} /> : null}
      {target.categoryId ? (
        <input type="hidden" name="categoryId" value={target.categoryId} />
      ) : null}

      {!target.sellerId && !target.categoryId && categories ? (
        <Select
          label="Category"
          name="categoryId"
          defaultValue={prefill?.categoryId ?? ""}
          placeholder="Choose a category"
          options={categories.map((c) => ({ value: c.id, label: c.name }))}
          error={state.fieldErrors?.categoryId}
        />
      ) : null}

      <Field
        label="What do you need?"
        name="productName"
        defaultValue={prefill?.productName ?? target.productName ?? ""}
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
          defaultValue={prefill?.quantity ? String(prefill.quantity) : undefined}
          placeholder="500"
          required
          error={state.fieldErrors?.quantity}
        />
        <Select
          label="Unit"
          name="quantityUnit"
          defaultValue={prefill?.quantityUnit ?? "pieces"}
          options={QUANTITY_UNITS.map((unit) => ({ value: unit, label: unit }))}
          error={state.fieldErrors?.quantityUnit}
        />
      </div>

      <Select
        label="Your city"
        name="locationId"
        defaultValue={prefill?.locationId ?? buyer?.locationId ?? ""}
        placeholder="Choose a city"
        options={cities.map((city) => ({ value: city.id, label: city.name }))}
        error={state.fieldErrors?.locationId}
      />

      <div className="grid grid-cols-2 gap-3">
        <Select
          label="When do you need it?"
          name="timeline"
          defaultValue={prefill?.timeline ?? "WITHIN_WEEK"}
          options={Object.entries(TIMELINE_LABELS).map(([value, label]) => ({ value, label }))}
          error={state.fieldErrors?.timeline}
        />
        <Select
          label="Purpose"
          name="purpose"
          defaultValue={prefill?.purpose ?? "BUSINESS_USE"}
          options={Object.entries(PURPOSE_LABELS).map(([value, label]) => ({ value, label }))}
          error={state.fieldErrors?.purpose}
        />
      </div>

      <Field
        label="Your name (optional)"
        name="name"
        defaultValue={prefill?.name ?? buyer?.name ?? ""}
        maxLength={120}
        error={state.fieldErrors?.name}
      />

      <TextArea
        label="Anything else? (optional)"
        name="notes"
        defaultValue={prefill?.notes ?? ""}
        rows={2}
        maxLength={1000}
        placeholder="Specifications, delivery needs…"
        error={state.fieldErrors?.notes}
      />

      {state.error ? <ErrorText>{state.error}</ErrorText> : null}

      <p className="text-xs text-neutral-500">
        {CONSENT_TEXT}{" "}
        <Link href="/privacy" className="underline hover:text-neutral-700">
          Privacy Policy
        </Link>
      </p>

      <PrimaryButton pending={pending}>
        {target.sellerHasWhatsApp ? "Send & open WhatsApp" : "Send requirement"}
      </PrimaryButton>
    </form>
  );
}

/** Rebuild form defaults from a kept draft. Unknown keys are ignored. */
function prefillFromFields(fields: Record<string, string>): RequirementPrefill {
  const quantity = Number(fields.quantity);
  return {
    productName: fields.productName || undefined,
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : undefined,
    quantityUnit: fields.quantityUnit || undefined,
    categoryId: fields.categoryId || undefined,
    locationId: fields.locationId || undefined,
    timeline: fields.timeline || undefined,
    purpose: fields.purpose || undefined,
    notes: fields.notes || undefined,
    name: fields.name || undefined,
  };
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
