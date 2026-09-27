"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  confirmAddonCheckoutAction,
  confirmPlanCheckoutAction,
  startAddonCheckoutAction,
  startPlanCheckoutAction,
} from "@/server/actions/billing";
import type { CheckoutPayload, CheckoutStart } from "@/server/services/billing.service";

/**
 * Razorpay Checkout for sellers paying Bzaro (D41) — plans (subscriptions)
 * and add-ons (one-time orders).
 *
 * The browser callback is a convenience: the server re-verifies the signature
 * before anything changes, and the billing webhook activates the plan or
 * fulfils the add-on even when this tab is closed mid-payment.
 */

type RazorpayCtor = new (options: Record<string, unknown>) => { open: () => void };

function loadRazorpay(): Promise<RazorpayCtor | null> {
  const existing = (window as unknown as { Razorpay?: RazorpayCtor }).Razorpay;
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () =>
      resolve((window as unknown as { Razorpay?: RazorpayCtor }).Razorpay ?? null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

type Status =
  { kind: "idle" } | { kind: "error"; message: string } | { kind: "done"; message: string };

function useCheckout(
  start: () => Promise<CheckoutStart>,
  confirm: (
    payload: CheckoutPayload,
    response: Record<string, string>,
  ) => Promise<{ ok: boolean; error?: string }>,
  successMessage: string,
) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  function run() {
    setStatus({ kind: "idle" });
    startTransition(async () => {
      const started = await start();
      if (!started.ok) {
        setStatus({ kind: "error", message: started.error });
        return;
      }
      const Razorpay = await loadRazorpay();
      if (!Razorpay) {
        setStatus({
          kind: "error",
          message: "Could not load the payment window. Check your connection.",
        });
        return;
      }
      const { payload } = started;
      await new Promise<void>((resolve) => {
        const checkout = new Razorpay({
          key: payload.keyId,
          ...(payload.subscriptionId
            ? { subscription_id: payload.subscriptionId }
            : { order_id: payload.orderId, amount: payload.amountMinor, currency: "INR" }),
          name: payload.name,
          description: payload.description,
          theme: { color: "#1d4ed8" },
          handler: async (response: Record<string, string>) => {
            const result = await confirm(payload, response);
            setStatus(
              result.ok
                ? { kind: "done", message: successMessage }
                : {
                    kind: "error",
                    message:
                      result.error ??
                      "We could not confirm the payment yet. If money was taken, it will show here within a few minutes.",
                  },
            );
            router.refresh();
            resolve();
          },
          modal: { ondismiss: () => resolve() },
        });
        checkout.open();
      });
    });
  }

  return { run, pending, status };
}

function StatusLine({ status }: { status: Status }) {
  if (status.kind === "idle") return null;
  return (
    <p
      role="status"
      className={`mt-2 text-xs ${status.kind === "error" ? "text-red-700" : "text-green-700"}`}
    >
      {status.message}
    </p>
  );
}

const buttonStyles = {
  primary: "bg-brand-700 hover:bg-brand-600 text-white",
  secondary: "border-brand-200 text-brand-800 hover:bg-brand-50 border bg-white",
  accent: "bg-accent-600 hover:bg-accent-700 text-white",
  gold: "bg-linear-to-r from-amber-500 via-yellow-400 to-amber-500 text-amber-950 shadow-sm shadow-amber-900/20 hover:from-amber-600 hover:via-yellow-500 hover:to-amber-600",
} as const;

export function SubscribeButton({
  planKey,
  interval,
  label,
  variant = "primary",
  disabled,
}: {
  planKey: string;
  interval: "MONTHLY" | "YEARLY";
  label: string;
  variant?: keyof typeof buttonStyles;
  disabled?: boolean;
}) {
  const { run, pending, status } = useCheckout(
    () => startPlanCheckoutAction(planKey, interval),
    (payload, response) =>
      confirmPlanCheckoutAction({
        subscriptionId: payload.subscriptionId ?? "",
        paymentId: response["razorpay_payment_id"] ?? "",
        signature: response["razorpay_signature"] ?? "",
      }),
    "Payment received — your plan is active.",
  );
  return (
    <div>
      <button
        type="button"
        onClick={run}
        disabled={disabled || pending}
        className={`inline-flex w-full justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${buttonStyles[variant]}`}
      >
        {pending ? "Opening payment…" : label}
      </button>
      <StatusLine status={status} />
    </div>
  );
}

export function AddonBuyButton({
  kind,
  label,
  variant = "secondary",
  disabled,
}: {
  kind: "LEAD_PACK" | "PAYMENT_GATEWAY" | "SHIPPING";
  label: string;
  variant?: keyof typeof buttonStyles;
  disabled?: boolean;
}) {
  const { run, pending, status } = useCheckout(
    () => startAddonCheckoutAction(kind),
    (payload, response) =>
      confirmAddonCheckoutAction({
        purchaseId: payload.purchaseId ?? "",
        orderId: payload.orderId ?? "",
        paymentId: response["razorpay_payment_id"] ?? "",
        signature: response["razorpay_signature"] ?? "",
      }),
    kind === "LEAD_PACK"
      ? "Payment received — credits added."
      : "Payment received — add-on is active.",
  );
  return (
    <div>
      <button
        type="button"
        onClick={run}
        disabled={disabled || pending}
        className={`inline-flex w-full justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${buttonStyles[variant]}`}
      >
        {pending ? "Opening payment…" : label}
      </button>
      <StatusLine status={status} />
    </div>
  );
}
