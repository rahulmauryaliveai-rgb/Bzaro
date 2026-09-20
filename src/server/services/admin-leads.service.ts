import "server-only";
import { db } from "@/lib/db";
import type { LeadFlagStatus } from "@/generated/prisma/enums";

/**
 * Admin views of the lead system. Read-only here; the mutations live in
 * credit.service (refund, adjust) and are called from the admin actions.
 *
 * Admins see buyer numbers unmasked — they resolve disputes about them.
 */

const PER_PAGE = 30;

// Sequential rather than Promise.all: these are low-traffic admin pages, and
// the local PGlite database (D24) interleaves concurrent prepared statements
// on its single connection badly enough to 500 the page.
export async function listRequirementsForAdmin(page: number) {
  const items = await db.requirement.findMany({
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PER_PAGE,
    take: PER_PAGE,
    select: {
      id: true,
      productName: true,
      quantity: true,
      quantityUnit: true,
      fanoutStatus: true,
      fanoutError: true,
      createdAt: true,
      location: { select: { name: true } },
      category: { select: { name: true } },
      buyer: { select: { phone: true, name: true } },
      _count: { select: { leads: true } },
      leads: {
        select: { type: true, status: true, seller: { select: { slug: true } } },
        orderBy: [{ type: "asc" }, { rank: "asc" }],
      },
    },
  });
  const total = await db.requirement.count();
  const counts = await db.requirement.groupBy({ by: ["fanoutStatus"], _count: { _all: true } });

  return {
    items,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / PER_PAGE)),
    byStatus: Object.fromEntries(counts.map((c) => [c.fanoutStatus, c._count._all])),
  };
}

export async function listLeadFlags(status: LeadFlagStatus | undefined, page: number) {
  const where = status ? { status } : {};
  const items = await db.leadFlag.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PER_PAGE,
    take: PER_PAGE,
    select: {
      id: true,
      reason: true,
      note: true,
      status: true,
      reviewNote: true,
      reviewedAt: true,
      createdAt: true,
      seller: { select: { id: true, slug: true, businessName: true, creditBalance: true } },
      lead: {
        select: {
          id: true,
          type: true,
          status: true,
          acceptedAt: true,
          requirement: {
            select: {
              productName: true,
              quantity: true,
              quantityUnit: true,
              location: { select: { name: true } },
              buyer: { select: { phone: true, name: true } },
            },
          },
          creditEntries: {
            where: { reason: "LEAD_ACCEPT" },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  });
  const total = await db.leadFlag.count({ where });
  const open = await db.leadFlag.count({ where: { status: "OPEN" } });

  return { items, total, open, page, pages: Math.max(1, Math.ceil(total / PER_PAGE)) };
}

/** Credit state for the admin seller page. */
export async function getSellerCreditsForAdmin(sellerId: string) {
  const seller = await db.seller.findUnique({
    where: { id: sellerId },
    select: {
      creditBalance: true,
      leadsReceived: true,
      leadsAccepted: true,
      responseRate: true,
      subscriptions: {
        where: { status: { in: ["ACTIVE", "TRIALING"] } },
        orderBy: { currentPeriodEnd: "desc" },
        take: 1,
        select: { plan: { select: { name: true, leadCreditsPerMonth: true } } },
      },
    },
  });
  const entries = await db.creditLedger.findMany({
    where: { sellerId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      delta: true,
      balanceAfter: true,
      reason: true,
      periodKey: true,
      note: true,
      createdAt: true,
    },
  });
  if (!seller) return null;
  return {
    creditBalance: seller.creditBalance,
    leadsReceived: seller.leadsReceived,
    leadsAccepted: seller.leadsAccepted,
    responseRate: seller.responseRate,
    plan: seller.subscriptions[0]?.plan ?? null,
    entries,
  };
}
