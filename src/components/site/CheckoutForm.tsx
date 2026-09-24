"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  confirmPaymentAction,
  startCheckoutAction,
  type CheckoutState,
} from "@/server/actions/checkout";
import { Field } from "@/components/dashboard/fields";
import { marketplaceUrl } from "@/lib/utils/url";

/**
 * Checkout: address, then Razorpay Checkout in a hosted modal.
 *
 * The gateway script is loaded only when the buyer actually reaches payment —
 * a third-party script on every storefront page would be a tracking surface
 * and a load cost for the majority who never check out.
 *
 * The browser callback is a convenience, not the source of truth: the server
 * re-verifies the signature, and the webhook confirms the order even if the
 * buyer closes the tab first.
 */

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

export function CheckoutForm({
  sellerName,
  buyerName,
  buyerPhone,
  codEnabled,
}: {
  sellerName: string;
  buyerName: string | null;
  buyerPhone: string | null;
  codEnabled: boolean;
}) {
  const [state, action, pending] = useActionState<CheckoutState, FormData>(startCheckoutAction, {});
  const [paying, setPaying] = useState(false);
  // A ref, not state: this guards against re-entry, and flipping state
  // synchronously inside the effect would cascade a render for nothing.
  const openedRef = useRef(false);
  const [result, setResult] = useState<{ orderNumber?: string; error?: string } | null>(null);

  useEffect(() => {
    const payment = state.payment;
    if (!payment || openedRef.current) return;
    openedRef.current = true;

    void (async () => {
      setPaying(true);
      const loaded = await loadRazorpay();
      if (!loaded || !window.Razorpay) {
        setResult({ error: "Could not load the payment window. Check your connection." });
        setPaying(false);
        return;
      }

      const checkout = new window.Razorpay({
        key: payment.keyId,
        order_id: payment.razorpayOrderId,
        amount: payment.amountMinor,
        currency: payment.currency,
        name: sellerName,
        prefill: { name: buyerName ?? undefined, contact: buyerPhone ?? undefined },
        handler: async (response: Record<string, string>) => {
          const confirmed = await confirmPaymentAction({
            orderId: payment.orderId,
            razorpayPaymentId: response["razorpay_payment_id"] ?? "",
            razorpaySignature: response["razorpay_signature"] ?? "",
          });
          setResult(
            confirmed.ok
              ? { orderNumber: confirmed.orderNumber }
              : { error: confirmed.error ?? "Payment could not be confirmed." },
          );
          setPaying(false);
        },
        modal: {
          ondismiss: () => {
            // Not an error: the order stays pending and the webhook will still
            // confirm it if the payment actually went through.
            openedRef.current = false;
            setPaying(false);
          },
        },
      });

      checkout.open();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.payment]);

  const orderNumber = result?.orderNumber ?? state.orderNumber;
  if (orderNumber) {
    return (
      <div className="rounded-lg border border-green-300 bg-green-50 p-5 text-center">
        <h2 className="text-base font-semibold text-green-900">Order placed</h2>
        <p className="mt-1 text-sm text-green-900">
          Your order number is <span className="font-mono">{orderNumber}</span>. {sellerName} will
          be in touch.
        </p>
        <a href={marketplaceUrl("/account/orders")} className="mt-3 inline-block text-sm underline">
          View my orders
        </a>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <Field
        label="Full name"
        name="name"
        required
        defaultValue={buyerName ?? undefined}
        error={state.fieldErrors?.name}
      />
      <Field label="Address" name="line1" required error={state.fieldErrors?.line1} />
      <Field label="Address line 2" name="line2" error={state.fieldErrors?.line2} />
      <Field label="City" name="city" required error={state.fieldErrors?.city} />
      <Field label="State" name="state" required error={state.fieldErrors?.state} />
      <Field
        label="PIN code"
        name="pincode"
        inputMode="numeric"
        maxLength={6}
        required
        error={state.fieldErrors?.pincode}
      />
      <Field
        label="Contact number"
        name="phone"
        type="tel"
        required
        defaultValue={buyerPhone ?? undefined}
        error={state.fieldErrors?.phone}
      />

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Payment</legend>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="radio" name="method" value="razorpay" defaultChecked />
          Pay online
        </label>
        {codEnabled ? (
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="radio" name="method" value="cod" />
            Cash on delivery
          </label>
        ) : null}
      </fieldset>

      {state.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
      {result?.error ? (
        <p className="text-sm text-red-600" role="alert">
          {result.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || paying}
        className="min-h-11 w-full rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
      >
        {paying ? "Opening payment…" : pending ? "Please wait…" : "Place order"}
      </button>
    </form>
  );
}
