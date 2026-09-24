import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { RazorpayConfig } from "@/server/services/integration.service";

/**
 * Razorpay, over plain `fetch` — same rule as every other vendor here: no SDK
 * outside this module.
 *
 * Bzaro never holds the money. Every call is authenticated with the *seller's*
 * own key pair, so the funds settle into the seller's account and we are only
 * ever the thing that asked.
 */

const API = "https://api.razorpay.com/v1";

function authHeader(config: RazorpayConfig): string {
  return `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64")}`;
}

export type RazorpayOrder = { id: string; amount: number; currency: string; status: string };

export type CreateOrderResult =
  | { ok: true; order: RazorpayOrder }
  | { ok: false; error: string };

export async function createRazorpayOrder(
  config: RazorpayConfig,
  params: { amountMinor: number; currency: string; receipt: string; notes?: Record<string, string> },
): Promise<CreateOrderResult> {
  try {
    const response = await fetch(`${API}/orders`, {
      method: "POST",
      headers: { Authorization: authHeader(config), "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: params.amountMinor,
        currency: params.currency,
        receipt: params.receipt,
        notes: params.notes,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return { ok: false, error: `Razorpay rejected the order (${response.status}): ${body.slice(0, 300)}` };
    }

    return { ok: true, order: (await response.json()) as RazorpayOrder };
  } catch (error) {
    return { ok: false, error: `Could not reach Razorpay: ${String(error).slice(0, 200)}` };
  }
}

/**
 * Verify the signature Razorpay Checkout hands back to the browser.
 *
 * HMAC-SHA256 of `${orderId}|${paymentId}` keyed by the seller's key secret.
 * Without this, a buyer could post an arbitrary payment id and be handed an
 * order they never paid for — the client callback is not evidence of payment,
 * this check is.
 */
export function verifyPaymentSignature(
  config: RazorpayConfig,
  params: { orderId: string; paymentId: string; signature: string },
): boolean {
  const expected = createHmac("sha256", config.keySecret)
    .update(`${params.orderId}|${params.paymentId}`)
    .digest("hex");

  return safeEqual(expected, params.signature);
}

/** Verify a webhook body against the seller's webhook secret. */
export function verifyWebhookSignature(
  config: RazorpayConfig,
  rawBody: string,
  signature: string,
): boolean {
  const expected = createHmac("sha256", config.webhookSecret).update(rawBody).digest("hex");
  return safeEqual(expected, signature);
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * A harmless authenticated call, for "Test connection". Listing a single
 * payment touches nothing and fails loudly on a bad key pair.
 */
export async function testRazorpayCredentials(
  config: RazorpayConfig,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const response = await fetch(`${API}/payments?count=1`, {
      headers: { Authorization: authHeader(config) },
    });

    if (response.status === 401) return { ok: false, error: "Key ID or Key Secret is wrong." };
    if (!response.ok) {
      return { ok: false, error: `Razorpay returned ${response.status}.` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: `Could not reach Razorpay: ${String(error).slice(0, 200)}` };
  }
}
