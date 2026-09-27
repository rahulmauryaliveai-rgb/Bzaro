import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { verifyBillingWebhook, type GatewaySubscription } from "@/lib/payments/billing-gateway";
import {
  activateGatewaySubscription,
  endGatewaySubscription,
  fulfillPurchaseByOrder,
  markSubscriptionPastDue,
  recordSubscriptionCharge,
} from "@/server/services/billing.service";
import { markGatewayRefundFailed } from "@/server/services/refund.service";

/**
 * Webhook for Bzaro's OWN Razorpay account (D41) — plans and add-ons that
 * sellers pay us. Never the seller-store webhook (`/api/webhooks/razorpay`),
 * which verifies against each seller's own secret.
 *
 * Verified over the raw body with RAZORPAY_BILLING_WEBHOOK_SECRET, then
 * de-duplicated through WebhookEvent (provider "razorpay-billing"). Every
 * handler below is idempotent on its own too, so a replay that slips past the
 * dedupe (e.g. the insert raced) still does nothing twice.
 *
 * Unknown or irrelevant events return 200: Razorpay retries non-2xx for a
 * day, and an event we do not act on will never become one we do.
 */

export const dynamic = "force-dynamic";

type Body = {
  event?: string;
  payload?: {
    subscription?: { entity?: GatewaySubscription };
    payment?: { entity?: { id?: string; amount?: number; order_id?: string | null; status?: string } };
    order?: { entity?: { id?: string } };
    refund?: { entity?: { id?: string; status?: string; error_description?: string } };
  };
};

export async function POST(request: NextRequest) {
  const signature = request.headers.get("x-razorpay-signature");
  if (!signature) return NextResponse.json({ error: "missing signature" }, { status: 400 });

  const rawBody = await request.text();
  if (!verifyBillingWebhook(rawBody, signature)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  let body: Body;
  try {
    body = JSON.parse(rawBody) as Body;
  } catch {
    return NextResponse.json({ error: "malformed body" }, { status: 400 });
  }

  const event = body.event ?? "unknown";
  const eventId =
    request.headers.get("x-razorpay-event-id") ??
    `${event}:${body.payload?.payment?.entity?.id ?? body.payload?.subscription?.entity?.id ?? ""}`;

  try {
    await db.webhookEvent.create({
      data: { provider: "razorpay-billing", eventId, type: event, payload: body as object },
    });
  } catch {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const subscription = body.payload?.subscription?.entity ?? null;
  const payment = body.payload?.payment?.entity ?? null;

  try {
    switch (event) {
      // "authenticated" (mandate set up) is not payment; wait for activated/charged.
      case "subscription.activated":
        if (subscription?.id) await activateGatewaySubscription(subscription.id, subscription);
        break;
      case "subscription.charged":
        if (subscription?.id && payment?.id && typeof payment.amount === "number") {
          await recordSubscriptionCharge({
            gatewaySubscriptionId: subscription.id,
            paymentId: payment.id,
            amountMinor: payment.amount,
            entity: subscription,
          });
        }
        break;
      case "subscription.pending":
      case "subscription.halted":
        if (subscription?.id) await markSubscriptionPastDue(subscription.id, subscription.status);
        break;
      case "subscription.cancelled":
        if (subscription?.id) await endGatewaySubscription(subscription.id, "CANCELED", subscription.status);
        break;
      case "subscription.completed":
        if (subscription?.id) await endGatewaySubscription(subscription.id, "EXPIRED", subscription.status);
        break;
      case "order.paid":
      case "payment.captured": {
        const orderId = payment?.order_id ?? body.payload?.order?.entity?.id ?? null;
        if (orderId && payment?.id) await fulfillPurchaseByOrder(orderId, payment.id);
        break;
      }
      case "refund.failed": {
        const refund = body.payload?.refund?.entity;
        if (refund?.id) await markGatewayRefundFailed(refund.id, refund.error_description ?? "unknown");
        break;
      }
      default:
        break;
    }
    await db.webhookEvent.update({
      where: { provider_eventId: { provider: "razorpay-billing", eventId } },
      data: { processedAt: new Date() },
    });
  } catch (error) {
    // Let Razorpay retry: drop the dedupe row so the retry is processed.
    await db.webhookEvent
      .delete({ where: { provider_eventId: { provider: "razorpay-billing", eventId } } })
      .catch(() => undefined);
    console.error("[razorpay-billing] handler failed", event, error);
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
