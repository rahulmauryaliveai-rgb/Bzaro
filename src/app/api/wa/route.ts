import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { verifyWhatsAppClick } from "@/lib/whatsapp/signing";
import { buildMessage, isValidWhatsAppNumber, toWhatsAppNumber } from "@/lib/whatsapp/link";
import { recordWhatsAppClick } from "@/server/services/enquiry.service";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";

/**
 * WhatsApp click tracker (threat T6).
 *
 * Logs the click, then redirects to wa.me.
 *
 * ── The destination is never caller-supplied ─────────────────────────────────
 * There is no `?to=` parameter. The handler receives a seller id, verifies an
 * HMAC over it, looks the number up in the database, and forwards to
 * `https://wa.me/<digits>`. That is what keeps this from being an open redirect
 * that lends the platform's domain reputation to a phishing page.
 *
 * ── Failure mode ─────────────────────────────────────────────────────────────
 * Any problem — bad signature, unknown seller, unusable number — redirects to
 * the marketplace home rather than erroring. A buyer who taps a WhatsApp button
 * should never land on a stack trace; and a 4xx here would tell an attacker
 * exactly which seller ids exist.
 */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const home = new URL("/", request.nextUrl.origin);

  const sellerId = params.get("s");
  const signature = params.get("sig");
  const entityType = params.get("t") ?? undefined;
  const entityId = params.get("e") ?? undefined;

  if (!sellerId || !signature) return NextResponse.redirect(home);

  if (!verifyWhatsAppClick({ sellerId, entityType, entityId }, signature)) {
    return NextResponse.redirect(home);
  }

  const ip = getClientIp(request.headers);

  // Generous limit: clicking a WhatsApp button is an ordinary user action. This
  // exists to stop the endpoint being used to inflate a competitor's analytics
  // or to hammer the database, not to police real buyers.
  const limit = await checkRateLimit("whatsapp", ip);

  const seller = await db.seller.findFirst({
    where: { id: sellerId, status: "VERIFIED", deletedAt: null },
    select: { id: true, businessName: true, whatsapp: true },
  });

  if (!seller || !isValidWhatsAppNumber(seller.whatsapp)) {
    return NextResponse.redirect(home);
  }

  // Resolve the entity name for the pre-filled message. Scoped by sellerId, so
  // a forged entity id from another tenant cannot leak a product name.
  let contextName: string | null = null;
  if (entityId && entityType === "product") {
    const product = await db.product.findFirst({
      where: { id: entityId, sellerId: seller.id },
      select: { name: true },
    });
    contextName = product?.name ?? null;
  } else if (entityId && entityType === "service") {
    const service = await db.service.findFirst({
      where: { id: entityId, sellerId: seller.id },
      select: { name: true },
    });
    contextName = service?.name ?? null;
  }

  if (limit.success) {
    // Analytics must never block the redirect. If the write fails, the buyer
    // still reaches WhatsApp — losing a data point beats losing a lead.
    void recordWhatsAppClick({
      sellerId: seller.id,
      entityType,
      entityId,
      ip,
      referrer: request.headers.get("referer"),
    }).catch(() => {});
  }

  const message =
    entityType === "product" && contextName
      ? buildMessage({
          kind: "product",
          productName: contextName,
          sellerName: seller.businessName,
        })
      : entityType === "service" && contextName
        ? buildMessage({
            kind: "service",
            serviceName: contextName,
            sellerName: seller.businessName,
          })
        : buildMessage({ kind: "seller", sellerName: seller.businessName });

  const target = `https://wa.me/${toWhatsAppNumber(seller.whatsapp!)}?text=${encodeURIComponent(message)}`;

  // 302, not 301: the destination depends on mutable seller data, and a
  // permanently-cached redirect would survive the seller changing their number.
  return NextResponse.redirect(target, 302);
}
