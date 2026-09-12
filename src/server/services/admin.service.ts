import "server-only";
import { db } from "@/lib/db";
import { revalidateTenant, revalidateIndexability } from "@/lib/cache/revalidate";
import { recomputeIndexability } from "@/server/services/indexability.service";
import { revokeSellerSessions } from "@/server/services/auth.service";
import { mailer } from "@/lib/mail";
import { tenantUrl, marketplaceUrl } from "@/lib/utils/url";
import { clientEnv } from "@/env.client";
import type { SellerStatus } from "@/generated/prisma/enums";

/**
 * Platform administration.
 *
 * ── Every state change does four things ──────────────────────────────────────
 * Verifying, suspending or banning a seller is never a single column update:
 *
 *   1. change the status
 *   2. write an AuditLog entry — who did what, to whom, when
 *   3. revoke sessions where the change reduces privilege (decision D19)
 *   4. recompute indexability and invalidate caches (decision D2)
 *
 * Steps 3 and 4 are the ones that get forgotten. A suspended seller whose
 * session stays live can keep editing; a suspended seller whose cache is not
 * invalidated keeps serving a cached site to crawlers. Both have happened to
 * other platforms, which is why these are bundled into one service function
 * rather than left to the caller.
 */

export type SellerListFilters = {
  status?: SellerStatus;
  query?: string;
  page: number;
  perPage: number;
};

export async function listSellersForAdmin(filters: SellerListFilters) {
  const where = {
    deletedAt: null,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.query
      ? {
          OR: [
            { businessName: { contains: filters.query, mode: "insensitive" as const } },
            { slug: { contains: filters.query, mode: "insensitive" as const } },
            { email: { contains: filters.query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    db.seller.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.perPage,
      take: filters.perPage,
      select: {
        id: true,
        slug: true,
        businessName: true,
        status: true,
        email: true,
        phone: true,
        productCount: true,
        serviceCount: true,
        profileScore: true,
        verifiedAt: true,
        createdAt: true,
        location: { select: { name: true } },
        website: { select: { indexable: true, indexBlockReason: true } },
      },
    }),
    db.seller.count({ where }),
  ]);

  return {
    items,
    total,
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(total / filters.perPage)),
  };
}

export async function getSellerForAdmin(id: string) {
  return db.seller.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      businessName: true,
      legalName: true,
      tagline: true,
      description: true,
      status: true,
      email: true,
      phone: true,
      whatsapp: true,
      addressLine1: true,
      postalCode: true,
      gstin: true,
      pan: true,
      establishedYear: true,
      employeeCount: true,
      productCount: true,
      serviceCount: true,
      profileScore: true,
      verifiedAt: true,
      createdAt: true,
      deletedAt: true,
      location: { select: { name: true, path: true } },
      website: {
        select: { indexable: true, indexBlockReason: true, publishedAt: true },
      },
      documents: {
        select: {
          id: true,
          type: true,
          status: true,
          reviewNote: true,
          reviewedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      },
      members: {
        select: {
          role: true,
          user: {
            select: { id: true, name: true, email: true, emailVerified: true, phoneVerified: true },
          },
        },
      },
      _count: { select: { enquiries: true } },
    },
  });
}

/**
 * Move a seller to VERIFIED.
 *
 * This is the moment a microsite becomes publicly reachable: tenant resolution
 * only returns VERIFIED sellers. So it must invalidate the tenant cache and
 * recompute indexability, or the site stays 404 to visitors and invisible to
 * crawlers until something else happens to bust the cache.
 */
export async function verifySeller(params: {
  sellerId: string;
  actorId: string;
  note?: string;
}): Promise<void> {
  const seller = await db.seller.update({
    where: { id: params.sellerId },
    data: { status: "VERIFIED", verifiedAt: new Date(), verifiedById: params.actorId },
    select: { slug: true, businessName: true, email: true },
  });

  await db.auditLog.create({
    data: {
      actorId: params.actorId,
      sellerId: params.sellerId,
      action: "seller.verify",
      after: { status: "VERIFIED", note: params.note ?? null },
    },
  });

  // Order matters: recompute first so the cache is invalidated with the new
  // indexability already persisted.
  await recomputeIndexability(params.sellerId);
  revalidateTenant(seller.slug, "background");

  if (seller.email) {
    await mailer.send({
      to: seller.email,
      subject: `${seller.businessName} is verified`,
      text: [
        `Your business has been verified on ${clientEnv.NEXT_PUBLIC_PLATFORM_NAME}.`,
        ``,
        `Your website is now live:`,
        tenantUrl(seller.slug),
        ``,
        `It becomes visible to search engines once your profile is complete —`,
        `your dashboard shows what's left:`,
        marketplaceUrl("/dashboard"),
      ].join("\n"),
    });
  }
}

export async function rejectSeller(params: {
  sellerId: string;
  actorId: string;
  reason: string;
}): Promise<void> {
  const seller = await db.seller.update({
    where: { id: params.sellerId },
    data: { status: "REJECTED" },
    select: { slug: true, businessName: true, email: true },
  });

  await db.auditLog.create({
    data: {
      actorId: params.actorId,
      sellerId: params.sellerId,
      action: "seller.reject",
      after: { status: "REJECTED", reason: params.reason },
    },
  });

  revalidateTenant(seller.slug, "background");

  if (seller.email) {
    await mailer.send({
      to: seller.email,
      subject: `About your ${clientEnv.NEXT_PUBLIC_PLATFORM_NAME} listing`,
      text: [
        `We weren't able to verify ${seller.businessName} at this time.`,
        ``,
        params.reason,
        ``,
        `You can update your details and request verification again.`,
      ].join("\n"),
    });
  }
}

/**
 * Suspend or ban.
 *
 * Privilege-reducing, so every member's session is revoked immediately (D19).
 * Without that, a suspended seller keeps working until their JWT expires.
 */
export async function suspendSeller(params: {
  sellerId: string;
  actorId: string;
  reason: string;
  ban?: boolean;
}): Promise<void> {
  const status: SellerStatus = params.ban ? "BANNED" : "SUSPENDED";

  const seller = await db.seller.update({
    where: { id: params.sellerId },
    data: { status },
    select: { slug: true },
  });

  await db.auditLog.create({
    data: {
      actorId: params.actorId,
      sellerId: params.sellerId,
      action: params.ban ? "seller.ban" : "seller.suspend",
      after: { status, reason: params.reason },
    },
  });

  await revokeSellerSessions(params.sellerId, `seller.${params.ban ? "ban" : "suspend"}.revoke`);

  // The microsite must stop serving immediately: a suspended seller's cached
  // pages would otherwise keep being handed to visitors and crawlers.
  revalidateIndexability(seller.slug, "background");
}

export async function reinstateSeller(params: {
  sellerId: string;
  actorId: string;
}): Promise<void> {
  const seller = await db.seller.update({
    where: { id: params.sellerId },
    data: { status: "VERIFIED" },
    select: { slug: true },
  });

  await db.auditLog.create({
    data: {
      actorId: params.actorId,
      sellerId: params.sellerId,
      action: "seller.reinstate",
      after: { status: "VERIFIED" },
    },
  });

  await recomputeIndexability(params.sellerId);
  revalidateTenant(seller.slug, "background");
}

// ── Content moderation (decision D10) ────────────────────────────────────────

export async function listModerationQueue(page = 1, perPage = 25) {
  const where = { moderationStatus: "PENDING" as const, deletedAt: null };

  const [products, total] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true,
        name: true,
        slug: true,
        shortDescription: true,
        description: true,
        createdAt: true,
        seller: { select: { id: true, slug: true, businessName: true } },
        images: { select: { url: true }, take: 1, orderBy: { sortOrder: "asc" } },
      },
    }),
    db.product.count({ where }),
  ]);

  return { products, total, page, pageCount: Math.max(1, Math.ceil(total / perPage)) };
}

export async function moderateProduct(params: {
  productId: string;
  actorId: string;
  approve: boolean;
  note?: string;
}): Promise<void> {
  const product = await db.product.update({
    where: { id: params.productId },
    data: { moderationStatus: params.approve ? "APPROVED" : "REJECTED" },
    select: { sellerId: true, seller: { select: { slug: true } } },
  });

  await db.auditLog.create({
    data: {
      actorId: params.actorId,
      sellerId: product.sellerId,
      action: params.approve ? "product.approve" : "product.reject",
      entityType: "product",
      entityId: params.productId,
      after: { note: params.note ?? null },
    },
  });

  // Approval can push a seller over the D2 catalogue threshold, so
  // indexability has to be recomputed — not just the product cache busted.
  await recomputeIndexability(product.sellerId);
  revalidateTenant(product.seller.slug, "background");
}

// ── Platform overview ────────────────────────────────────────────────────────

export async function getPlatformStats() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    sellers,
    pending,
    verified,
    suspended,
    products,
    pendingModeration,
    enquiries,
    recentEnquiries,
    indexable,
  ] = await Promise.all([
    db.seller.count({ where: { deletedAt: null } }),
    db.seller.count({ where: { status: "PENDING_VERIFICATION", deletedAt: null } }),
    db.seller.count({ where: { status: "VERIFIED", deletedAt: null } }),
    db.seller.count({ where: { status: "SUSPENDED", deletedAt: null } }),
    db.product.count({ where: { deletedAt: null } }),
    db.product.count({ where: { moderationStatus: "PENDING", deletedAt: null } }),
    db.enquiry.count({ where: { isSpam: false } }),
    db.enquiry.count({ where: { isSpam: false, createdAt: { gte: since } } }),
    db.sellerWebsite.count({ where: { indexable: true } }),
  ]);

  return {
    sellers,
    pending,
    verified,
    suspended,
    products,
    pendingModeration,
    enquiries,
    recentEnquiries,
    indexable,
  };
}

export async function listAuditLog(page = 1, perPage = 50) {
  const [items, total] = await Promise.all([
    db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        sellerId: true,
        createdAt: true,
        after: true,
        actor: { select: { name: true, email: true } },
      },
    }),
    db.auditLog.count(),
  ]);

  return { items, total, page, pageCount: Math.max(1, Math.ceil(total / perPage)) };
}
