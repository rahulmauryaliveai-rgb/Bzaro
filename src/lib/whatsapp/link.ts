import { clientEnv } from "@/env.client";

/**
 * WhatsApp click-to-chat links.
 *
 * ── What this can and cannot do ──────────────────────────────────────────────
 * `wa.me` deep links open WhatsApp with a pre-filled message. The user still
 * has to press send, and nothing reports back whether they did.
 *
 * So a WhatsApp click records INTENT, never a delivered message. Analytics and
 * the enquiry pipeline must treat it that way, and the seller-facing UI must
 * not describe these as "messages received". Confirming delivery requires the
 * WhatsApp Business API, which is out of scope for v1.
 *
 * ── Number format ────────────────────────────────────────────────────────────
 * wa.me requires digits only — no `+`, no spaces, no hyphens. We store E.164
 * (`+919876543210`) and strip the plus here. Passing a formatted number
 * produces a link that opens WhatsApp to a "phone number is invalid" dialog,
 * which looks like a broken site rather than a bad number.
 */

export type WhatsAppContext =
  | { kind: "product"; productName: string; sellerName: string; url?: string }
  | { kind: "service"; serviceName: string; sellerName: string; url?: string }
  | { kind: "seller"; sellerName: string; url?: string };

/** Strip everything that is not a digit. */
export function toWhatsAppNumber(e164: string): string {
  return e164.replace(/\D/g, "");
}

/** True when the number can produce a working wa.me link. */
export function isValidWhatsAppNumber(e164: string | null | undefined): e164 is string {
  if (!e164) return false;
  const digits = toWhatsAppNumber(e164);
  // ITU-T E.164: at most 15 digits, and a country code means at least 8.
  return digits.length >= 8 && digits.length <= 15;
}

/**
 * Contextual pre-filled messages.
 *
 * These are written from the buyer's side, because the buyer is the one who
 * sends them. A message that reads like marketing copy gets deleted before
 * sending; one that reads like something the buyer would actually type gets
 * sent as-is, which is the entire point of pre-filling it.
 */
export function buildMessage(context: WhatsAppContext): string {
  const platform = clientEnv.NEXT_PUBLIC_PLATFORM_NAME;

  switch (context.kind) {
    case "product":
      return [
        `Hello, I found your product ${context.productName} on ${platform}.`,
        `I am interested and would like to know the price and details.`,
        context.url ? `\n${context.url}` : "",
      ]
        .filter(Boolean)
        .join(" ")
        .trim();

    case "service":
      return [
        `Hello, I found your service ${context.serviceName} on ${platform}.`,
        `I would like to know more about availability and pricing.`,
        context.url ? `\n${context.url}` : "",
      ]
        .filter(Boolean)
        .join(" ")
        .trim();

    case "seller":
      return [
        `Hello ${context.sellerName}, I found your business on ${platform}.`,
        `I would like to know more about your products and services.`,
        context.url ? `\n${context.url}` : "",
      ]
        .filter(Boolean)
        .join(" ")
        .trim();
  }
}

/**
 * Build a direct wa.me URL.
 *
 * Prefer `trackedWhatsAppHref()` on public pages: it records the click before
 * forwarding, so sellers can see which products actually drive contact.
 */
export function whatsAppHref(e164: string, context: WhatsAppContext): string {
  const number = toWhatsAppNumber(e164);
  const text = encodeURIComponent(buildMessage(context));
  return `https://wa.me/${number}?text=${text}`;
}

/**
 * Build an internal redirect URL that logs the click, then forwards to WhatsApp.
 *
 * The route is signed (see src/app/api/wa/route.ts) so it cannot be used as an
 * open redirect: without a signature, `/api/wa?to=<anything>` would let an
 * attacker borrow the platform's domain reputation to bounce victims anywhere.
 */
export function trackedWhatsAppHref(params: {
  sellerId: string;
  entityType?: "product" | "service" | "seller";
  entityId?: string;
  signature: string;
}): string {
  const search = new URLSearchParams({
    s: params.sellerId,
    sig: params.signature,
  });
  if (params.entityType) search.set("t", params.entityType);
  if (params.entityId) search.set("e", params.entityId);
  return `/api/wa?${search.toString()}`;
}
