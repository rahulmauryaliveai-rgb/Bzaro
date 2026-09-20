import "server-only";
import { db } from "@/lib/db";
import { leadNotifier, type LeadNotification } from "@/lib/notify";
import { formatPhone, maskPhone } from "@/lib/buyer/phone";
import { PURPOSE_LABELS, TIMELINE_LABELS } from "@/lib/validation/requirement";
import { isValidWhatsAppNumber } from "@/lib/whatsapp/link";
import { marketplaceUrl } from "@/lib/utils/url";

/**
 * Drains the LeadDelivery outbox (docs/LEADS.md §5).
 *
 * PANEL deliveries are "sent" the moment the lead row exists — the panel IS
 * the database — so they are marked SENT without a provider round trip. The
 * row is kept because it is the seller-visible record that a lead was
 * delivered, and because an EMAIL channel will use the same table later.
 *
 * WHATSAPP deliveries go through the LeadNotifier. The summary handed to it
 * is rendered here, already masked for MARKET leads: a notifier never holds
 * a buyer number it is not allowed to show.
 */

export const DELIVERY_MAX_ATTEMPTS = 5;

/**
 * Claim up to `limit` pending deliveries. A claimed row keeps status PENDING
 * (there is no RUNNING for deliveries) but its `attempts` and `updatedAt`
 * move, and the lease clause keeps a second worker from re-claiming it for a
 * minute. Fresh rows (attempts = 0) are claimable immediately.
 */
export async function claimPendingDeliveries(limit = 20): Promise<string[]> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    UPDATE "LeadDelivery"
       SET "attempts" = "attempts" + 1,
           "updatedAt" = now()
     WHERE id IN (
       SELECT id FROM "LeadDelivery"
        WHERE "status" = 'PENDING'
          AND ("attempts" = 0 OR "updatedAt" < now() - interval '1 minute')
        ORDER BY "createdAt"
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
     )
     RETURNING id`;
  return rows.map((row) => row.id);
}

export type DeliveryOutcome = "SENT" | "FAILED" | "RETRY" | "SKIPPED";

export async function processDelivery(deliveryId: string): Promise<DeliveryOutcome> {
  const delivery = await db.leadDelivery.findUnique({
    where: { id: deliveryId },
    select: {
      id: true,
      channel: true,
      attempts: true,
      lead: {
        select: {
          id: true,
          type: true,
          status: true,
          seller: { select: { businessName: true, whatsapp: true } },
          requirement: {
            select: {
              productName: true,
              quantity: true,
              quantityUnit: true,
              timeline: true,
              purpose: true,
              notes: true,
              location: { select: { name: true } },
              buyer: { select: { phone: true, name: true } },
            },
          },
        },
      },
    },
  });
  if (!delivery) return "SKIPPED";

  if (delivery.channel === "PANEL") {
    await db.leadDelivery.update({
      where: { id: delivery.id },
      data: { status: "SENT", provider: "panel", sentAt: new Date() },
    });
    return "SENT";
  }

  if (delivery.channel === "WHATSAPP" && !isValidWhatsAppNumber(delivery.lead.seller.whatsapp)) {
    await db.leadDelivery.update({
      where: { id: delivery.id },
      data: { status: "SKIPPED", lastError: "seller has no WhatsApp number" },
    });
    return "SKIPPED";
  }

  const notification = buildNotification({
    leadId: delivery.lead.id,
    leadType: delivery.lead.type,
    sellerName: delivery.lead.seller.businessName,
    to: delivery.lead.seller.whatsapp,
    requirement: delivery.lead.requirement,
  });

  const result = await leadNotifier.notify(notification);

  if (result.ok) {
    await db.leadDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "SENT",
        provider: leadNotifier.name,
        providerMessageId: result.providerMessageId ?? null,
        sentAt: new Date(),
        lastError: null,
      },
    });
    return "SENT";
  }

  const exhausted = delivery.attempts >= DELIVERY_MAX_ATTEMPTS || !result.retryable;
  await db.leadDelivery.update({
    where: { id: delivery.id },
    data: {
      status: exhausted ? "FAILED" : "PENDING",
      provider: leadNotifier.name,
      lastError: result.error.slice(0, 500),
    },
  });
  return exhausted ? "FAILED" : "RETRY";
}

type RequirementForNotification = {
  productName: string;
  quantity: number;
  quantityUnit: string;
  timeline: keyof typeof TIMELINE_LABELS;
  purpose: keyof typeof PURPOSE_LABELS;
  notes: string | null;
  location: { name: string };
  buyer: { phone: string; name: string | null };
};

/** Pure. Exported for tests: the masking rule lives here. */
export function buildNotification(input: {
  leadId: string;
  leadType: "DIRECT" | "MARKET";
  sellerName: string;
  to: string | null;
  requirement: RequirementForNotification;
}): LeadNotification {
  const r = input.requirement;
  const masked = input.leadType === "MARKET";
  const phone = masked ? maskPhone(r.buyer.phone) : formatPhone(r.buyer.phone);
  const who = r.buyer.name && !masked ? `${r.buyer.name} (${phone})` : phone;

  const summary = [
    masked
      ? "New market lead — accept in your dashboard to see the buyer's number."
      : "New enquiry from a buyer.",
    `Product: ${r.productName}`,
    `Quantity: ${r.quantity} ${r.quantityUnit}`,
    `City: ${r.location.name}`,
    `Needed: ${TIMELINE_LABELS[r.timeline]} · ${PURPOSE_LABELS[r.purpose]}`,
    r.notes && !masked ? `Notes: ${r.notes}` : "",
    `Buyer: ${who}`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    leadId: input.leadId,
    leadType: input.leadType,
    to: isValidWhatsAppNumber(input.to) ? input.to : null,
    sellerName: input.sellerName,
    summary,
    dashboardUrl: marketplaceUrl(`/dashboard/leads/${input.leadId}`),
  };
}
