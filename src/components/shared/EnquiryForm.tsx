"use client";

import { useActionState, useEffect, useRef } from "react";
import { submitEnquiryAction, type EnquiryState } from "@/server/actions/enquiry";

/**
 * Enquiry form.
 *
 * Used on both microsites and marketplace product pages. Styled with CSS
 * variables so it inherits a seller's theme on their own site and falls back to
 * neutral defaults on the marketplace.
 *
 * ── Anti-spam, in layers ─────────────────────────────────────────────────────
 *  1. Honeypot — a `website` field hidden from humans. Bots fill it.
 *  2. Timing — how long the form was on screen. Scripts submit near-instantly.
 *  3. Rate limit — per IP, server-side.
 *  4. Heuristic scoring — server-side, flags rather than blocks.
 *
 * Turnstile is the missing fifth layer and is deliberately not wired up yet: it
 * needs a real site key, and shipping a broken widget would block every genuine
 * enquiry. The four layers above work today.
 *
 * The honeypot is hidden with inline styles rather than a utility class,
 * because a CSS bundle that fails to load would otherwise expose it to humans —
 * who would then fill it in and be silently filtered.
 */

const INITIAL: EnquiryState = {};

export function EnquiryForm({
  sellerSlug,
  source = "MICROSITE_CONTACT",
  productId,
  serviceId,
  about,
  themed = false,
}: {
  sellerSlug: string;
  source?: "MICROSITE_CONTACT" | "MICROSITE_PRODUCT" | "MARKETPLACE_PRODUCT" | "MARKETPLACE_SELLER";
  productId?: string;
  serviceId?: string;
  /** Shown above the form so the buyer knows what they are enquiring about. */
  about?: string;
  /** Use the seller's theme tokens instead of marketplace neutrals. */
  themed?: boolean;
}) {
  const [state, action, pending] = useActionState(submitEnquiryAction, INITIAL);

  // Mount time is recorded in an effect, not during render: `Date.now()` is
  // impure, and calling it in a render body breaks React 19's purity
  // expectations (and is flagged by react-hooks/purity).
  const mountedAt = useRef<number | null>(null);
  const elapsedInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    mountedAt.current = Date.now();
  }, []);

  /**
   * Stamp elapsed time at submit.
   *
   * Both timestamps come from the same client clock, so the difference is
   * meaningful even when that clock disagrees with the server's.
   */
  const stampElapsed = () => {
    if (elapsedInput.current && mountedAt.current !== null) {
      elapsedInput.current.value = String(Date.now() - mountedAt.current);
    }
  };

  const border = themed ? "var(--site-border)" : "#d4d4d4";
  const accent = themed ? "var(--site-primary)" : "#171717";

  if (state.ok) {
    return (
      <div
        role="status"
        className="rounded-lg border p-6 text-center"
        style={{ borderColor: border }}
      >
        <p className="font-medium">{state.message}</p>
        <p className="mt-1 text-sm opacity-70">Most suppliers reply within a working day.</p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="sellerSlug" value={sellerSlug} />
      <input type="hidden" name="source" value={source} />
      {productId ? <input type="hidden" name="productId" value={productId} /> : null}
      {serviceId ? <input type="hidden" name="serviceId" value={serviceId} /> : null}

      {/* Timing signal, stamped at submit. */}
      <input type="hidden" name="elapsedMs" ref={elapsedInput} defaultValue="" />

      {/* Honeypot. Hidden inline so a missing stylesheet cannot reveal it. */}
      <div style={{ position: "absolute", left: "-9999px" }} aria-hidden="true">
        <label htmlFor="website-field">Website (leave blank)</label>
        <input id="website-field" type="text" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      {about ? (
        <p className="rounded-md px-3 py-2 text-sm" style={{ background: "rgba(0,0,0,0.04)" }}>
          Enquiring about <strong>{about}</strong>
        </p>
      ) : null}

      {state.error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Your name"
          name="name"
          required
          autoComplete="name"
          error={state.fieldErrors?.name}
          border={border}
        />
        <Field
          label="Company"
          name="company"
          autoComplete="organization"
          error={state.fieldErrors?.company}
          border={border}
        />
        <Field
          label="Phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          error={state.fieldErrors?.phone}
          border={border}
        />
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          error={state.fieldErrors?.email}
          border={border}
        />
      </div>

      <Field
        label="Quantity needed"
        name="quantity"
        type="number"
        error={state.fieldErrors?.quantity}
        border={border}
      />

      <div>
        <label htmlFor="enquiry-message" className="mb-1 block text-sm font-medium">
          What do you need?
        </label>
        <textarea
          id="enquiry-message"
          name="message"
          required
          rows={5}
          maxLength={5000}
          placeholder="Quantities, specifications, delivery location, timeline…"
          aria-invalid={state.fieldErrors?.message ? true : undefined}
          className="w-full rounded-md border px-3 py-2 text-sm outline-none"
          style={{ borderColor: state.fieldErrors?.message ? "#dc2626" : border }}
        />
        {state.fieldErrors?.message ? (
          <p className="mt-1 text-xs text-red-600">{state.fieldErrors.message}</p>
        ) : null}
      </div>

      {/* DPDP Act: consent must be explicit and unbundled, not implied by use. */}
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="consent" className="mt-0.5" />
        <span className="opacity-80">
          I agree to this supplier contacting me about this enquiry.
          {state.fieldErrors?.consent ? (
            <span className="block text-xs text-red-600">{state.fieldErrors.consent}</span>
          ) : null}
        </span>
      </label>

      <button
        type="submit"
        disabled={pending}
        onClick={stampElapsed}
        className="w-full rounded-md px-4 py-2.5 text-sm font-medium disabled:opacity-60"
        style={{ background: accent, color: themed ? "var(--site-background)" : "#fff" }}
      >
        {pending ? "Sending…" : "Send enquiry"}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  autoComplete,
  error,
  border,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  error?: string;
  border: string;
}) {
  const id = `enquiry-${name}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
        {!required ? <span className="ml-1 text-xs opacity-50">(optional)</span> : null}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        className="w-full rounded-md border px-3 py-2 text-sm outline-none"
        style={{ borderColor: error ? "#dc2626" : border }}
      />
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
