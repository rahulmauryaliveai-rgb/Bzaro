"use client";

import { CategoryPicker, type CategoryOption } from "@/components/onboarding/CategoryPicker";
import { useActionState, useId, useRef, useState } from "react";
import {
  checkSlugAction,
  registerBusinessAction,
  type SellerActionState,
} from "@/server/actions/seller";
import { clientEnv } from "@/env.client";
import {
  BUSINESS_TYPES,
  BUSINESS_TYPE_LABELS,
  MAX_SECONDARY_CATEGORIES,
} from "@/lib/validation/onboarding";

/**
 * Business registration.
 *
 * ── The slug is the important field ──────────────────────────────────────────
 * It becomes the seller's permanent web address, and it can only be changed
 * once every 90 days afterwards (decision D11). So it gets live availability
 * checking, a visible preview of the resulting URL, and an auto-suggestion from
 * the business name — anything that reduces the chance of someone typing it
 * wrong and living with it.
 *
 * The check is debounced and its results are raced-guarded: a slow response for
 * an earlier value must not overwrite the verdict for what the user has since
 * typed, or they see "available" for a slug that is actually taken.
 */

const INITIAL: SellerActionState = {};

type SlugState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available" }
  | { status: "taken"; reason: string };

/** Business name → a sensible default address. */
function suggestSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 63)
    .replace(/^-+|-+$/g, "");
}

export function BusinessRegistrationForm({
  categories,
  locations,
  defaultPhone = "",
}: {
  categories: CategoryOption[];
  locations: Array<{ id: string; name: string; parent: { name: string } | null }>;
  /** From the account step, so the seller does not type it twice. */
  defaultPhone?: string;
}) {
  const [state, action, pending] = useActionState(registerBusinessAction, INITIAL);
  const [homeLocationId, setHomeLocationId] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugState, setSlugState] = useState<SlugState>({ status: "idle" });
  const formId = useId();

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Monotonic id so a slow response cannot overwrite a newer verdict. */
  const latestRequest = useRef(0);

  /**
   * Update the slug and schedule an availability check.
   *
   * Event-driven rather than an effect watching `slug`. This is a request
   * triggered by user input, not a synchronisation with external state — and
   * React 19 flags `setState` inside an effect body for exactly this reason
   * (react-hooks/set-state-in-effect).
   */
  function updateSlug(next: string) {
    setSlug(next);

    if (debounce.current) clearTimeout(debounce.current);

    if (next.length < 3) {
      setSlugState({ status: "idle" });
      return;
    }

    setSlugState({ status: "checking" });

    // Debounced: checking on every keystroke would fire a request per
    // character, and the responses would arrive out of order.
    debounce.current = setTimeout(() => {
      const id = ++latestRequest.current;

      void checkSlugAction(next).then((result) => {
        // A response for a value the user has since changed is discarded —
        // otherwise they see "available" for a slug they are no longer typing.
        if (id !== latestRequest.current) return;

        setSlugState(
          result.available
            ? { status: "available" }
            : { status: "taken", reason: result.reason ?? "Not available." },
        );
      });
    }, 400);
  }

  const rootDomain = clientEnv.NEXT_PUBLIC_ROOT_DOMAIN;

  return (
    <form action={action} className="space-y-6">
      {state.error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      <div>
        <label htmlFor={`${formId}-name`} className="mb-1 block text-sm font-medium">
          Business name
        </label>
        <input
          id={`${formId}-name`}
          name="businessName"
          required
          maxLength={200}
          autoComplete="organization"
          onChange={(event) => {
            // Only auto-fill until the seller edits the address themselves —
            // after that, retyping the name must not clobber their choice.
            if (!slugTouched) updateSlug(suggestSlug(event.currentTarget.value));
          }}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        {state.fieldErrors?.businessName ? (
          <p className="mt-1 text-xs text-red-600">{state.fieldErrors.businessName}</p>
        ) : null}
      </div>

      <div>
        <label htmlFor={`${formId}-slug`} className="mb-1 block text-sm font-medium">
          Your web address
        </label>

        <div className="flex items-center rounded-md border border-neutral-300 focus-within:border-neutral-900">
          <input
            id={`${formId}-slug`}
            name="slug"
            required
            value={slug}
            onChange={(event) => {
              setSlugTouched(true);
              updateSlug(event.currentTarget.value.toLowerCase());
            }}
            maxLength={63}
            autoComplete="off"
            spellCheck={false}
            aria-describedby={`${formId}-slug-status`}
            className="min-w-0 flex-1 rounded-l-md px-3 py-2 font-mono text-sm outline-none"
          />
          <span className="shrink-0 border-l border-neutral-200 bg-neutral-50 px-3 py-2 font-mono text-sm text-neutral-500">
            .{rootDomain}
          </span>
        </div>

        <p id={`${formId}-slug-status`} className="mt-1 text-xs" aria-live="polite">
          {state.fieldErrors?.slug ? (
            <span className="text-red-600">{state.fieldErrors.slug}</span>
          ) : slugState.status === "checking" ? (
            <span className="text-neutral-500">Checking…</span>
          ) : slugState.status === "available" ? (
            <span className="text-teal-700">
              Available — your site will be at {slug}.{rootDomain}
            </span>
          ) : slugState.status === "taken" ? (
            <span className="text-red-600">{slugState.reason}</span>
          ) : (
            <span className="text-neutral-500">
              Lowercase letters, numbers and hyphens. You can change this later, but only once every
              90 days.
            </span>
          )}
        </p>
      </div>

      <div>
        <label htmlFor={`${formId}-phone`} className="mb-1 block text-sm font-medium">
          Phone (with country code)
        </label>
        <input
          id={`${formId}-phone`}
          name="phone"
          required
          defaultValue={defaultPhone}
          placeholder="98765 43210"
          maxLength={24}
          autoComplete="tel"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-neutral-500">
          The business line buyers call. Your WhatsApp number from the previous step is used for
          WhatsApp enquiries.
        </p>
        {state.fieldErrors?.phone ? (
          <p className="mt-1 text-xs text-red-600">{state.fieldErrors.phone}</p>
        ) : null}
      </div>

      <div>
        <label htmlFor={`${formId}-type`} className="mb-1 block text-sm font-medium">
          Business type
        </label>
        <select
          id={`${formId}-type`}
          name="businessType"
          required
          defaultValue=""
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
        >
          <option value="" disabled>
            Choose…
          </option>
          {BUSINESS_TYPES.map((type) => (
            <option key={type} value={type}>
              {BUSINESS_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
        {state.fieldErrors?.businessType ? (
          <p className="mt-1 text-xs text-red-600">{state.fieldErrors.businessType}</p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
        <div>
          <label htmlFor={`${formId}-address`} className="mb-1 block text-sm font-medium">
            Address
          </label>
          <input
            id={`${formId}-address`}
            name="addressLine1"
            required
            maxLength={200}
            autoComplete="street-address"
            placeholder="Plot 14, Industrial Estate"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          {state.fieldErrors?.addressLine1 ? (
            <p className="mt-1 text-xs text-red-600">{state.fieldErrors.addressLine1}</p>
          ) : null}
        </div>
        <div>
          <label htmlFor={`${formId}-pin`} className="mb-1 block text-sm font-medium">
            PIN code
          </label>
          <input
            id={`${formId}-pin`}
            name="postalCode"
            required
            inputMode="numeric"
            maxLength={6}
            autoComplete="postal-code"
            placeholder="400001"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          {state.fieldErrors?.postalCode ? (
            <p className="mt-1 text-xs text-red-600">{state.fieldErrors.postalCode}</p>
          ) : null}
        </div>
      </div>

      <div>
        <label htmlFor={`${formId}-location`} className="mb-1 block text-sm font-medium">
          City
        </label>
        <select
          id={`${formId}-location`}
          name="locationId"
          required
          value={homeLocationId}
          onChange={(event) => setHomeLocationId(event.currentTarget.value)}
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
        >
          <option value="" disabled>
            Choose your city…
          </option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
              {location.parent ? `, ${location.parent.name}` : ""}
            </option>
          ))}
        </select>
        {state.fieldErrors?.locationId ? (
          <p className="mt-1 text-xs text-red-600">{state.fieldErrors.locationId}</p>
        ) : null}
      </div>

      <CategoryPicker
        groups={categories}
        maxSecondary={MAX_SECONDARY_CATEGORIES}
        errors={{
          primaryCategoryId: state.fieldErrors?.primaryCategoryId,
          secondaryCategoryIds: state.fieldErrors?.secondaryCategoryIds,
        }}
      />

      <fieldset>
        <legend className="mb-2 text-sm font-medium">
          Cities you deliver to{" "}
          <span className="font-normal text-neutral-500">(besides your own)</span>
        </legend>
        <p className="mb-3 text-xs text-neutral-500">
          Buyers in these cities see you in their listings and their requirements can reach you.
        </p>
        <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-md border border-neutral-200 p-3">
          {locations
            .filter((location) => location.id !== homeLocationId)
            .map((location) => (
              <label key={location.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="servesLocationIds" value={location.id} />
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
          <p className="mt-1 text-xs text-red-600">{state.fieldErrors.servesLocationIds}</p>
        ) : null}
      </fieldset>

      <button
        type="submit"
        disabled={pending || slugState.status === "taken"}
        className="w-full rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Continue"}
      </button>

      <p className="text-xs text-neutral-500">
        Your website address is reserved immediately. It goes live once we verify your business —
        usually within a working day.
      </p>
    </form>
  );
}
