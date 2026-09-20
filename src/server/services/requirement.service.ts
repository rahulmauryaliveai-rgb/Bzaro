import "server-only";
import { db } from "@/lib/db";
import { hashIp } from "@/lib/ratelimit";
import { isValidWhatsAppNumber } from "@/lib/whatsapp/link";
import { requirementFingerprint, type RequirementInput } from "@/lib/validation/requirement";
import type { LeadChannel } from "@/generated/prisma/enums";

/**
 * Requirement creation — the request-path half of the lead system.
 *
 * Does exactly two things, in one transaction (docs/LEADS.md §2):
 *   1. Insert the Requirement with fanoutStatus = PENDING.
 *   2. If a seller was chosen, insert the DIRECT lead and its delivery rows.
 *
 * Matching and MARKET leads happen in the worker. Nothing here waits on them,
 * and a matcher failure can never lose the DIRECT lead.
 */

export type CreateRequirementResult =
  | {
      ok: true;
      requirementId: string;
      /** Present when a DIRECT lead was created. */
      direct: {
        leadId: string;
        sellerName: string;
        /** E.164, only when it can produce a working wa.me link. */
        whatsapp: string | null;
      } | null;
      cityName: string;
    }
  | {
      ok: false;
      reason: "product_unavailable" | "seller_unavailable" | "category_invalid" | "city_invalid";
    };

export async function createRequirement(params: {
  buyerId: string;
  input: RequirementInput;
  ip: string;
  userAgent?: string | null;
}): Promise<CreateRequirementResult> {
  const { input } = params;

  // ── Resolve the direct seller and matching category ────────────────────────
  let directSellerId: string | null = null;
  let categoryId: string | null = null;
  let sellerName: string | null = null;
  let sellerWhatsapp: string | null = null;

  if (input.productId) {
    const product = await db.product.findFirst({
      where: {
        id: input.productId,
        status: "PUBLISHED",
        deletedAt: null,
        moderationStatus: "APPROVED",
        seller: { status: "VERIFIED", deletedAt: null },
      },
      select: {
        categoryId: true,
        seller: {
          select: {
            id: true,
            businessName: true,
            whatsapp: true,
            categories: { where: { isPrimary: true }, select: { categoryId: true }, take: 1 },
          },
        },
      },
    });
    if (!product) return { ok: false, reason: "product_unavailable" };

    directSellerId = product.seller.id;
    sellerName = product.seller.businessName;
    sellerWhatsapp = product.seller.whatsapp;
    categoryId = product.categoryId ?? product.seller.categories[0]?.categoryId ?? null;
  } else if (input.sellerId) {
    const seller = await db.seller.findFirst({
      where: { id: input.sellerId, status: "VERIFIED", deletedAt: null },
      select: {
        id: true,
        businessName: true,
        whatsapp: true,
        categories: { where: { isPrimary: true }, select: { categoryId: true }, take: 1 },
      },
    });
    if (!seller) return { ok: false, reason: "seller_unavailable" };

    directSellerId = seller.id;
    sellerName = seller.businessName;
    sellerWhatsapp = seller.whatsapp;
    categoryId = input.categoryId ?? seller.categories[0]?.categoryId ?? null;
  } else {
    categoryId = input.categoryId ?? null;
  }

  if (!categoryId) return { ok: false, reason: "category_invalid" };

  const [category, city] = await Promise.all([
    db.category.findFirst({ where: { id: categoryId, isActive: true }, select: { id: true } }),
    db.location.findFirst({
      where: { id: input.locationId, type: "CITY", isActive: true },
      select: { id: true, name: true },
    }),
  ]);
  if (!category) return { ok: false, reason: "category_invalid" };
  if (!city) return { ok: false, reason: "city_invalid" };

  const whatsapp = isValidWhatsAppNumber(sellerWhatsapp) ? sellerWhatsapp : null;

  // ── Write ──────────────────────────────────────────────────────────────────
  const created = await db.$transaction(async (tx) => {
    const requirement = await tx.requirement.create({
      data: {
        buyerId: params.buyerId,
        productId: input.productId ?? null,
        directSellerId,
        categoryId: category.id,
        locationId: city.id,
        productName: input.productName,
        quantity: input.quantity,
        quantityUnit: input.quantityUnit,
        timeline: input.timeline,
        purpose: input.purpose,
        notes: input.notes ?? null,
        fingerprint: requirementFingerprint(input.productName, category.id),
        ipHash: hashIp(params.ip),
        userAgent: params.userAgent?.slice(0, 500) ?? null,
      },
      select: { id: true },
    });

    let leadId: string | null = null;
    if (directSellerId) {
      const lead = await tx.lead.create({
        data: {
          requirementId: requirement.id,
          sellerId: directSellerId,
          type: "DIRECT",
          status: "NEW",
          masked: false,
          expiresAt: null,
        },
        select: { id: true },
      });
      leadId = lead.id;

      // PANEL always; WHATSAPP only when there is a number to send to. The
      // worker drains these through the LeadNotifier.
      const channels: LeadChannel[] = whatsapp ? ["PANEL", "WHATSAPP"] : ["PANEL"];
      await tx.leadDelivery.createMany({
        data: channels.map((channel) => ({ leadId: lead.id, channel })),
      });

      // Attribution on the seller's analytics, alongside whatsapp_click.
      await tx.analyticsEvent.create({
        data: {
          sellerId: directSellerId,
          type: "lead_submit",
          entityType: input.productId ? "product" : "seller",
          entityId: input.productId ?? directSellerId,
          ipHash: hashIp(params.ip),
        },
      });
    }

    await tx.buyer.update({
      where: { id: params.buyerId },
      data: {
        ...(input.name ? { name: input.name } : {}),
        locationId: city.id,
        lastSeenAt: new Date(),
      },
    });

    return { requirementId: requirement.id, leadId };
  });

  return {
    ok: true,
    requirementId: created.requirementId,
    direct:
      created.leadId && directSellerId && sellerName
        ? { leadId: created.leadId, sellerName, whatsapp }
        : null,
    cityName: city.name,
  };
}
