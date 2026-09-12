import "server-only";
import { db } from "@/lib/db";
import { mailer } from "@/lib/mail";
import { hashIp } from "@/lib/ratelimit";
import { marketplaceUrl } from "@/lib/utils/url";
import { clientEnv } from "@/env.client";
import {
  hasContactMethod,
  scoreSpam,
  SPAM_THRESHOLD,
  type EnquiryInput,
} from "@/lib/validation/enquiry";
import type { EnquirySource } from "@/generated/prisma/enums";

/**
 * Enquiries — the demand side of the platform.
 *
 * ── Decision D5: leads are free ──────────────────────────────────────────────
 * Contact details are stored and shown to the seller unmasked. The metering
 * columns (`Enquiry.unlockedAt`, `Plan.leadCreditsPerMonth`) exist and stay
 * null, so switching to paid unlocks later is a feature flag rather than a
 * migration.
 *
 * ── Spam handling ────────────────────────────────────────────────────────────
 * Suspected spam is STORED, flagged, and withheld from the inbox — never
 * silently dropped. A false positive is a lost customer for a real business, so
 * a human must be able to find and recover it. Only the notification is
 * suppressed.
 */

export type CreateEnquiryResult =
  | { ok: true; id: string; spam: boolean }
  | { ok: false; reason: "no_contact" | "seller_unavailable" };

export async function createEnquiry(params: {
  sellerId: string;
  input: EnquiryInput;
  source: EnquirySource;
  ip: string;
  userAgent?: string | null;
  referrer?: string | null;
  landingPath?: string | null;
  buyerUserId?: string | null;
}): Promise<CreateEnquiryResult> {
  const { input } = params;

  if (!hasContactMethod(input)) {
    return { ok: false, reason: "no_contact" };
  }

  // Re-verify the seller here rather than trusting the caller. This is the
  // write path: a stale page or a crafted request could name a seller who has
  // since been suspended.
  const seller = await db.seller.findFirst({
    where: { id: params.sellerId, status: "VERIFIED", deletedAt: null },
    select: { id: true, slug: true, businessName: true, email: true },
  });

  if (!seller) return { ok: false, reason: "seller_unavailable" };

  const spamScore = scoreSpam({
    message: input.message,
    name: input.name,
    elapsedMs: input.elapsedMs,
    hasHoneypot: Boolean(input.website && input.website.length > 0),
  });

  const isSpam = spamScore >= SPAM_THRESHOLD;

  // Product and service references are verified to belong to THIS seller.
  // Without that check, a crafted request could attach one seller's enquiry to
  // another seller's product, corrupting both parties' analytics.
  const [product, service] = await Promise.all([
    input.productId
      ? db.product.findFirst({
          where: { id: input.productId, sellerId: seller.id },
          select: { id: true, name: true },
        })
      : null,
    input.serviceId
      ? db.service.findFirst({
          where: { id: input.serviceId, sellerId: seller.id },
          select: { id: true, name: true },
        })
      : null,
  ]);

  const enquiry = await db.enquiry.create({
    data: {
      sellerId: seller.id,
      productId: product?.id ?? null,
      serviceId: service?.id ?? null,
      buyerUserId: params.buyerUserId ?? null,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      company: input.company ?? null,
      message: input.message,
      quantity: input.quantity ?? null,
      source: params.source,
      status: isSpam ? "SPAM" : "NEW",
      isSpam,
      spamScore,
      // Raw IPs are never stored — personal data under the DPDP Act.
      ipHash: hashIp(params.ip),
      userAgent: params.userAgent?.slice(0, 500) ?? null,
      referrer: params.referrer?.slice(0, 500) ?? null,
      landingPath: params.landingPath?.slice(0, 500) ?? null,
    },
    select: { id: true },
  });

  if (!isSpam) {
    // Counters are denormalised for the dashboard; keep them in step with the
    // write rather than recomputing on read.
    if (product) {
      await db.product.update({
        where: { id: product.id },
        data: { enquiryCount: { increment: 1 } },
      });
    } else if (service) {
      await db.service.update({
        where: { id: service.id },
        data: { enquiryCount: { increment: 1 } },
      });
    }

    await notifySeller({
      sellerEmail: seller.email,
      businessName: seller.businessName,
      enquiry: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        company: input.company,
        message: input.message,
        quantity: input.quantity,
        about: product?.name ?? service?.name ?? null,
      },
    });
  }

  return { ok: true, id: enquiry.id, spam: isSpam };
}

/**
 * Email the seller.
 *
 * Fire-and-forget by design: a mail failure must never fail the buyer's
 * submission. The enquiry is already stored and visible in the dashboard, so
 * the lead is not lost — only the notification is.
 */
async function notifySeller(params: {
  sellerEmail: string | null;
  businessName: string;
  enquiry: {
    name: string;
    email?: string;
    phone?: string;
    company?: string;
    message: string;
    quantity?: number;
    about: string | null;
  };
}): Promise<void> {
  if (!params.sellerEmail) return;

  const { enquiry } = params;
  const platform = clientEnv.NEXT_PUBLIC_PLATFORM_NAME;

  await mailer.send({
    to: params.sellerEmail,
    subject: enquiry.about
      ? `New enquiry: ${enquiry.about}`
      : `New enquiry for ${params.businessName}`,
    text: [
      `You have a new enquiry on ${platform}.`,
      ``,
      enquiry.about ? `About: ${enquiry.about}` : null,
      `From: ${enquiry.name}${enquiry.company ? ` (${enquiry.company})` : ""}`,
      enquiry.phone ? `Phone: ${enquiry.phone}` : null,
      enquiry.email ? `Email: ${enquiry.email}` : null,
      enquiry.quantity ? `Quantity: ${enquiry.quantity}` : null,
      ``,
      enquiry.message,
      ``,
      `Reply directly, or manage enquiries here:`,
      marketplaceUrl("/dashboard/enquiries"),
    ]
      .filter((line) => line !== null)
      .join("\n"),
  });
}

/**
 * Record a WhatsApp click.
 *
 * This records INTENT, not a delivered message — `wa.me` cannot report whether
 * the user pressed send. The seller-facing UI must never describe these as
 * "messages received", which is why the source enum name is explicit.
 */
export async function recordWhatsAppClick(params: {
  sellerId: string;
  entityType?: string | null;
  entityId?: string | null;
  ip: string;
  referrer?: string | null;
}): Promise<void> {
  await db.analyticsEvent.create({
    data: {
      sellerId: params.sellerId,
      type: "whatsapp_click",
      entityType: params.entityType ?? null,
      entityId: params.entityId ?? null,
      referrer: params.referrer?.slice(0, 500) ?? null,
      ipHash: hashIp(params.ip),
    },
  });
}

export type EnquiryListFilters = {
  status?: "NEW" | "VIEWED" | "RESPONDED" | "CONVERTED" | "CLOSED" | "SPAM";
  page: number;
  perPage: number;
};

/** Seller inbox. Spam is excluded unless explicitly requested. */
export async function listSellerEnquiries(sellerId: string, filters: EnquiryListFilters) {
  const where = {
    sellerId,
    ...(filters.status
      ? { status: filters.status }
      : // The default view hides spam: the whole point of the flag is that the
        // seller does not have to wade through it.
        { isSpam: false }),
  };

  const [items, total, unread] = await Promise.all([
    db.enquiry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.perPage,
      take: filters.perPage,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        company: true,
        message: true,
        quantity: true,
        source: true,
        status: true,
        isSpam: true,
        spamScore: true,
        createdAt: true,
        respondedAt: true,
        product: { select: { name: true, slug: true } },
        service: { select: { name: true, slug: true } },
      },
    }),
    db.enquiry.count({ where }),
    db.enquiry.count({ where: { sellerId, status: "NEW", isSpam: false } }),
  ]);

  return {
    items,
    total,
    unread,
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(total / filters.perPage)),
  };
}

/** Mark an enquiry read. Scoped by sellerId so it cannot touch another tenant. */
export async function markEnquiryViewed(sellerId: string, enquiryId: string): Promise<void> {
  await db.enquiry.updateMany({
    where: { id: enquiryId, sellerId, status: "NEW" },
    data: { status: "VIEWED" },
  });
}

export async function updateEnquiryStatus(
  sellerId: string,
  enquiryId: string,
  status: "VIEWED" | "RESPONDED" | "CONVERTED" | "CLOSED" | "SPAM",
): Promise<void> {
  await db.enquiry.updateMany({
    where: { id: enquiryId, sellerId },
    data: {
      status,
      ...(status === "RESPONDED" ? { respondedAt: new Date() } : {}),
      ...(status === "SPAM" ? { isSpam: true } : {}),
    },
  });
}
