import type { LeadType } from "@/generated/prisma/enums";

/**
 * Outbound lead notification to a SELLER.
 *
 * The worker builds one of these per LeadDelivery row and hands it to the
 * configured LeadNotifier. The payload is deliberately pre-rendered: the
 * provider decides how to transport it (WhatsApp template, SMS, email), never
 * what it says, so the copy lives in one place and is testable without a
 * provider.
 */
export type LeadNotification = {
  leadId: string;
  leadType: LeadType;
  /** Seller's WhatsApp number, E.164. Null when the seller has none. */
  to: string | null;
  /** Business name, for the greeting. */
  sellerName: string;
  /** Rendered summary: product, quantity, city, timeline. Already masked
   * for MARKET leads — the notifier must never receive a buyer number it is
   * not allowed to show. */
  summary: string;
  /** Absolute URL of the lead in the seller dashboard. */
  dashboardUrl: string;
};

export type NotifyResult =
  { ok: true; providerMessageId?: string } | { ok: false; error: string; retryable: boolean };

export interface LeadNotifier {
  readonly name: string;
  /** Never throws. */
  notify(notification: LeadNotification): Promise<NotifyResult>;
}
