import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { verifyWebhookSignature } from "@/lib/payments/razorpay";
import { decryptJson } from "@/lib/crypto/secrets";
import { markPaid } from "@/server/services/order.service";
import type { RazorpayConfig } from "@/server/services/integration.service";

/**
 * Razorpay webhook — the reliable half of payment confirmation.
 *
 * The browser callback in `confirmPayment` is faster but optional: a buyer who
 * closes the tab mid-redirect never fires it. This does, and both are
 * idempotent, so whichever arrives first marks the order paid and the other is
 * a provable no-op.
 *
 * ── Why the raw body ─────────────────────────────────────────────────────────
 * The signature is an HMAC over the exact bytes Razorpay sent. Parsing to JSON
 * and re-serialising changes them (key order, whitespace, unicode escapes), so
 * the body is read as text and only parsed after it verifies.
 *
 * ── Which secret ─────────────────────────────────────────────────────────────
 * Each seller has their own webhook secret, so the payload must be attributed
 * to a seller before it can be verified. The order id in `notes` does that;
 * the signature then proves the payload really came from that seller's account.
 *
 * Route handlers skip the proxy, so this is reachable on any host — which is
 * fine, because the signature is the only thing that authorises it.
 */

export const dynamic = "force-dynamic";

type RazorpayWebhookBody = {
  event?: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
        notes?: Record<string, string>;
      };
    };
  };
};

export async function POST(request: NextRequest) {
  const signature = request.headers.get("x-razorpay-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  const rawBody = await request.text();

  let parsed: RazorpayWebhookBody;
  try {
    parsed = JSON.parse(rawBody) as RazorpayWebhookBody;
  } catch {
    return NextResponse.json({ error: "malformed body" }, { status: 400 });
  }

  const payment = parsed.payload?.payment?.entity;
  const bzaroOrderId = payment?.notes?.["bzaroOrderId"];
  if (!payment?.id || !bzaroOrderId) {
    // Not an event we act on (refunds, settlements, subscription pings).
    return NextResponse.json({ ok: true, ignored: true });
  }

  const order = await db.order.findUnique({
    where: { id: bzaroOrderId },
    select: { id: true, sellerId: true },
  });
  if (!order) {
    // 200, not 404: Razorpay retries non-2xx for hours, and an order we do not
    // have is never going to appear.
    return NextResponse.json({ ok: true, ignored: true });
  }

  const integration = await db.sellerIntegration.findUnique({
    where: { sellerId_type: { sellerId: order.sellerId, type: "RAZORPAY" } },
    select: { encryptedConfig: true },
  });
  if (!integration) return NextResponse.json({ ok: true, ignored: true });

  const config = decryptJson<RazorpayConfig>(integration.encryptedConfig);
  if (!verifyWebhookSignature(config, rawBody, signature)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  // Replay protection. The unique index on (provider, eventId) makes a repeat
  // delivery a provable no-op rather than a second fan-out of demand alerts.
  const eventId = request.headers.get("x-razorpay-event-id") ?? payment.id;
  try {
    await db.webhookEvent.create({
      data: {
        provider: "razorpay",
        eventId,
        type: parsed.event ?? "unknown",
        payload: parsed as object,
        processedAt: new Date(),
      },
    });
  } catch {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  if (parsed.event === "payment.captured") {
    await markPaid(order.id, payment.id);
  }

  return NextResponse.json({ ok: true });
}
