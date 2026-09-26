"use client";

import { useActionState } from "react";
import {
  saveRazorpayAction,
  saveShiprocketAction,
  setAutoShipAction,
  setCodAction,
  shipOrderAction,
  testRazorpayAction,
  toggleRazorpayAction,
  toggleShiprocketAction,
  type IntegrationState,
} from "@/server/actions/integrations";
import { Field, Select } from "@/components/dashboard/fields";

/**
 * Payment and shipping credential forms.
 *
 * Secrets are write-only: a saved key is shown as `••••last4` and the input is
 * left empty. Re-rendering a secret into the DOM so the seller can "check it"
 * would put it in the page source, in the browser's autofill store and in any
 * screenshot of this page — for no benefit, since they can simply paste it
 * again.
 */

const MODE_OPTIONS = [
  { value: "TEST", label: "Test" },
  { value: "LIVE", label: "Live" },
];

function useIntegrationForm(
  action: (s: IntegrationState, f: FormData) => Promise<IntegrationState>,
) {
  return useActionState<IntegrationState, FormData>(action, {});
}

export function RazorpayForm({ hint, mode }: { hint: string | null; mode: "TEST" | "LIVE" }) {
  const [state, action, pending] = useIntegrationForm(saveRazorpayAction);

  return (
    <form action={action} className="space-y-4">
      <Field
        label="Key ID"
        name="keyId"
        required
        hint={hint ? `Currently saved: ${hint}` : "Starts with rzp_test_ or rzp_live_"}
        error={state.fieldErrors?.keyId}
      />
      <Field
        label="Key Secret"
        name="keySecret"
        type="password"
        required
        hint="Stored encrypted. We never show it again."
        error={state.fieldErrors?.keySecret}
      />
      <Field
        label="Webhook Secret"
        name="webhookSecret"
        type="password"
        required
        hint="From the webhook you create in Razorpay, below."
        error={state.fieldErrors?.webhookSecret}
      />
      <Select
        label="Mode"
        name="mode"
        defaultValue={mode}
        error={state.fieldErrors?.mode}
        options={MODE_OPTIONS}
      />

      <FormFeedback state={state} />

      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save keys"}
      </button>
    </form>
  );
}

export function TestConnectionButton() {
  const [state, action, pending] = useActionState<IntegrationState, FormData>(
    async () => testRazorpayAction(),
    {},
  );

  return (
    <form action={action} className="space-y-2">
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-md border border-neutral-300 px-4 text-sm font-medium hover:bg-neutral-50 disabled:opacity-60"
      >
        {pending ? "Testing…" : "Test connection"}
      </button>
      <FormFeedback state={state} />
    </form>
  );
}

export function EnableToggle({
  kind,
  enabled,
}: {
  kind: "razorpay" | "shiprocket";
  enabled: boolean;
}) {
  const [state, action, pending] = useIntegrationForm(
    kind === "razorpay" ? toggleRazorpayAction : toggleShiprocketAction,
  );

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
      <button
        type="submit"
        disabled={pending}
        className={`min-h-11 rounded-md px-4 text-sm font-medium disabled:opacity-60 ${
          enabled
            ? "border border-neutral-300 hover:bg-neutral-50"
            : "bg-neutral-900 text-white hover:bg-neutral-800"
        }`}
      >
        {pending ? "Working…" : enabled ? "Switch off" : "Switch on"}
      </button>
      <FormFeedback state={state} />
    </form>
  );
}

export type ShiprocketDefaults = {
  pickupLocation?: string;
  defaultWeightKg?: string;
  defaultLengthCm?: string;
  defaultBreadthCm?: string;
  defaultHeightCm?: string;
};

export function ShiprocketForm({
  hint,
  mode,
  defaults,
}: {
  hint: string | null;
  mode: "TEST" | "LIVE";
  defaults?: ShiprocketDefaults;
}) {
  const [state, action, pending] = useIntegrationForm(saveShiprocketAction);

  return (
    <form action={action} className="space-y-4">
      <Field
        label="API user email"
        name="email"
        type="email"
        required
        hint={
          hint
            ? `Currently saved: ${hint}`
            : "Create a separate API user in Shiprocket — not your login."
        }
        error={state.fieldErrors?.email}
      />
      <Field
        label="API user password"
        name="password"
        type="password"
        required
        hint="Stored encrypted."
        error={state.fieldErrors?.password}
      />
      <Field
        label="Pickup PIN code"
        name="pickupPostcode"
        inputMode="numeric"
        maxLength={6}
        hint="Where couriers collect from."
        error={state.fieldErrors?.pickupPostcode}
      />
      <Field
        label="Pickup location name"
        name="pickupLocation"
        defaultValue={defaults?.pickupLocation}
        hint="Must match the nickname of the address in Shiprocket. Defaults to “Primary”."
        error={state.fieldErrors?.pickupLocation}
      />

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Default weight (kg)"
          name="defaultWeightKg"
          inputMode="decimal"
          defaultValue={defaults?.defaultWeightKg}
          error={state.fieldErrors?.defaultWeightKg}
        />
        <Field
          label="Length (cm)"
          name="defaultLengthCm"
          inputMode="decimal"
          defaultValue={defaults?.defaultLengthCm}
          error={state.fieldErrors?.defaultLengthCm}
        />
        <Field
          label="Breadth (cm)"
          name="defaultBreadthCm"
          inputMode="decimal"
          defaultValue={defaults?.defaultBreadthCm}
          error={state.fieldErrors?.defaultBreadthCm}
        />
        <Field
          label="Height (cm)"
          name="defaultHeightCm"
          inputMode="decimal"
          defaultValue={defaults?.defaultHeightCm}
          error={state.fieldErrors?.defaultHeightCm}
        />
      </div>
      <p className="text-xs text-neutral-500">
        Shiprocket refuses a shipment without dimensions. These are used for every order.
      </p>
      <Select
        label="Mode"
        name="mode"
        defaultValue={mode}
        error={state.fieldErrors?.mode}
        options={MODE_OPTIONS}
      />

      <FormFeedback state={state} />

      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save credentials"}
      </button>
    </form>
  );
}

function FormFeedback({ state }: { state: IntegrationState }) {
  if (state.error) {
    return (
      <p className="text-sm text-red-600" role="alert">
        {state.error}
      </p>
    );
  }
  if (state.message) {
    return (
      <p className="text-sm text-green-700" role="status">
        {state.message}
      </p>
    );
  }
  return null;
}

/** Book the shipment on payment, or leave it to the seller. */
export function AutoShipToggle({ autoCreate }: { autoCreate: boolean }) {
  const [state, action, pending] = useIntegrationForm(setAutoShipAction);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="autoCreate" value={autoCreate ? "false" : "true"} />
      <p className="text-sm text-neutral-700">
        {autoCreate
          ? "Shipments are booked automatically when an order is paid."
          : "You book each shipment yourself from the Orders tab."}
      </p>
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-md border border-neutral-300 px-4 text-sm font-medium hover:bg-neutral-50 disabled:opacity-60"
      >
        {pending ? "Working…" : autoCreate ? "Book them myself" : "Book automatically"}
      </button>
      <FormFeedback state={state} />
    </form>
  );
}

/** "Ship now" on a paid order that has no waybill yet. */
export function ShipNowButton({ orderId }: { orderId: string }) {
  const [state, action, pending] = useIntegrationForm(shipOrderAction);

  return (
    <form action={action} className="mt-2 space-y-1">
      <input type="hidden" name="orderId" value={orderId} />
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-md border border-neutral-300 px-3 text-sm font-medium hover:bg-neutral-50 disabled:opacity-60"
      >
        {pending ? "Booking…" : "Ship now"}
      </button>
      <FormFeedback state={state} />
    </form>
  );
}

/** Cash on delivery, offered alongside online payment at checkout. */
export function CodToggle({ codEnabled }: { codEnabled: boolean }) {
  const [state, action, pending] = useIntegrationForm(setCodAction);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="codEnabled" value={codEnabled ? "false" : "true"} />
      <p className="text-sm text-neutral-700">
        {codEnabled
          ? "Buyers can choose cash on delivery. Those orders reach you unpaid."
          : "Cash on delivery is off — buyers can only pay online (if Razorpay is connected)."}
      </p>
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-md border border-neutral-300 px-4 text-sm font-medium hover:bg-neutral-50 disabled:opacity-60"
      >
        {pending ? "Working…" : codEnabled ? "Turn COD off" : "Turn COD on"}
      </button>
      <FormFeedback state={state} />
    </form>
  );
}
