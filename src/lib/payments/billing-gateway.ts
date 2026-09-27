import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/env";

/**
 * Bzaro's OWN Razorpay account (D41): sellers pay Bzaro for plans, lead packs
 * and add-ons. Deliberately a separate module from `razorpay.ts`, which only
 * ever speaks with a seller's keys on behalf of their buyers — the two must
 * never share credentials or a webhook.
 *
 * Plain `fetch`, no SDK, same as every other vendor in this codebase.
 */

const API = "https://api.razorpay.com/v1";

export function isBillingGatewayConfigured(): boolean {
  return Boolean(env.RAZORPAY_BILLING_KEY_ID && env.RAZORPAY_BILLING_KEY_SECRET);
}

/** The public key id, for Razorpay Checkout in the browser. */
export function billingKeyId(): string | null {
  return env.RAZORPAY_BILLING_KEY_ID || null;
}

function credentials(): { keyId: string; keySecret: string } {
  const keyId = env.RAZORPAY_BILLING_KEY_ID;
  const keySecret = env.RAZORPAY_BILLING_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("Razorpay billing keys are not configured");
  return { keyId, keySecret };
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<Result<T>> {
  const { keyId, keySecret } = credentials();
  try {
    const response = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const text = await response.text();
    if (!response.ok) {
      // Razorpay error bodies carry a description, never a secret.
      let description = text.slice(0, 300);
      try {
        description =
          (JSON.parse(text) as { error?: { description?: string } }).error?.description ??
          description;
      } catch {
        // keep the raw slice
      }
      return { ok: false, error: description, status: response.status };
    }
    return { ok: true, data: JSON.parse(text) as T };
  } catch (error) {
    return { ok: false, error: `Could not reach Razorpay: ${String(error).slice(0, 200)}` };
  }
}

// ── Plans & subscriptions ────────────────────────────────────────────────────

export type GatewayPlan = { id: string; period: string; item: { amount: number } };

export function createGatewayPlan(params: {
  period: "monthly" | "yearly";
  name: string;
  amountMinor: number;
  description: string;
  notes: Record<string, string>;
}) {
  return call<GatewayPlan>("POST", "/plans", {
    period: params.period,
    interval: 1,
    item: {
      name: params.name,
      amount: params.amountMinor,
      currency: "INR",
      description: params.description,
    },
    notes: params.notes,
  });
}

export type GatewaySubscription = {
  id: string;
  plan_id: string;
  status: string;
  current_start: number | null;
  current_end: number | null;
  charge_at: number | null;
  short_url?: string;
  notes?: Record<string, string>;
};

export function createGatewaySubscription(params: {
  planId: string;
  totalCount: number;
  notes: Record<string, string>;
}) {
  return call<GatewaySubscription>("POST", "/subscriptions", {
    plan_id: params.planId,
    total_count: params.totalCount,
    quantity: 1,
    customer_notify: 1,
    notes: params.notes,
  });
}

export function fetchGatewaySubscription(id: string) {
  return call<GatewaySubscription>("GET", `/subscriptions/${encodeURIComponent(id)}`);
}

export function cancelGatewaySubscription(id: string, atCycleEnd: boolean) {
  return call<GatewaySubscription>("POST", `/subscriptions/${encodeURIComponent(id)}/cancel`, {
    cancel_at_cycle_end: atCycleEnd ? 1 : 0,
  });
}

// ── One-time orders & refunds ────────────────────────────────────────────────

export type GatewayOrder = { id: string; amount: number; currency: string; status: string };

export function createGatewayOrder(params: {
  amountMinor: number;
  receipt: string;
  notes: Record<string, string>;
}) {
  return call<GatewayOrder>("POST", "/orders", {
    amount: params.amountMinor,
    currency: "INR",
    receipt: params.receipt,
    notes: params.notes,
  });
}

export type GatewayRefund = { id: string; amount: number; status: string };

export function refundGatewayPayment(paymentId: string, amountMinor: number, notes: Record<string, string>) {
  return call<GatewayRefund>("POST", `/payments/${encodeURIComponent(paymentId)}/refund`, {
    amount: amountMinor,
    speed: "normal",
    notes,
  });
}

// ── Signatures ───────────────────────────────────────────────────────────────

function hmac(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Checkout callback for a one-time order: HMAC(orderId|paymentId). */
export function verifyOrderPayment(params: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const { keySecret } = credentials();
  return safeEqual(hmac(keySecret, `${params.orderId}|${params.paymentId}`), params.signature);
}

/** Checkout callback for a subscription: HMAC(paymentId|subscriptionId). */
export function verifySubscriptionPayment(params: {
  subscriptionId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const { keySecret } = credentials();
  return safeEqual(
    hmac(keySecret, `${params.paymentId}|${params.subscriptionId}`),
    params.signature,
  );
}

/** Webhook body, verified over the raw bytes. False when no secret is set. */
export function verifyBillingWebhook(rawBody: string, signature: string): boolean {
  const secret = env.RAZORPAY_BILLING_WEBHOOK_SECRET;
  if (!secret) return false;
  return safeEqual(hmac(secret, rawBody), signature);
}
