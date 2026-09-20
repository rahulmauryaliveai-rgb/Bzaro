import "server-only";
import { db } from "@/lib/db";
import { projectLead, type Entitlement, type LeadRow, type LeadView } from "@/lib/leads/projection";
import { debitForAcceptWith } from "@/server/services/credit.service";
import type { LeadFlagReason, LeadStatus, LeadType } from "@/generated/prisma/enums";

/**
 * Seller lead inbox (docs/LEADS.md §2, §4).
 *
 * Every read here takes an already-authorised `sellerId` and puts it in the
 * WHERE clause; every write is an `updateMany` scoped by it. A forged lead id
 * from another tenant matches zero rows. The page never sees a raw row —
 * everything goes through `projectLead`, which is where masking lives.
 */

const leadSelect = {
  id: true,
  type: true,
  status: true,
  score: true,
  expiresAt: true,
  viewedAt: true,
  acceptedAt: true,
  closedAt: true,
  sellerNote: true,
  createdAt: true,
  requirement: {
    select: {
      productName: true,
      quantity: true,
      quantityUnit: true,
      timeline: true,
      purpose: true,
      notes: true,
      location: { select: { name: true } },
      category: { select: { name: true } },
      product: { select: { name: true, slug: true } },
      buyer: { select: { phone: true, name: true, company: true } },
    },
  },
  flag: { select: { status: true, reason: true } },
} as const;

/** What this seller's plan allows. Read once per page. */
export async function getEntitlement(sellerId: string): Promise<Entitlement> {
  const seller = await db.seller.findUnique({
    where: { id: sellerId },
    select: {
      creditBalance: true,
      subscriptions: {
        where: { status: { in: ["ACTIVE", "TRIALING"] } },
        orderBy: { currentPeriodEnd: "desc" },
        take: 1,
        select: { plan: { select: { name: true, leadCreditsPerMonth: true } } },
      },
    },
  });
  const plan = seller?.subscriptions[0]?.plan;
  const monthlyCredits = plan?.leadCreditsPerMonth ?? 0;
  const creditBalance = seller?.creditBalance ?? 0;
  return {
    creditBalance,
    monthlyCredits,
    planName: plan?.name ?? "Free",
    canAccept: monthlyCredits > 0 || creditBalance > 0,
  };
}

export type LeadListFilters = {
  type?: LeadType;
  status?: LeadStatus;
  page: number;
  perPage: number;
};

export async function listSellerLeads(sellerId: string, filters: LeadListFilters) {
  const where = {
    sellerId,
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.status ? { status: filters.status } : {}),
  };

  const [rows, total, unread, entitlement] = await Promise.all([
    db.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.perPage,
      take: filters.perPage,
      select: leadSelect,
    }),
    db.lead.count({ where }),
    db.lead.count({ where: { sellerId, status: "NEW" } }),
    getEntitlement(sellerId),
  ]);

  return {
    items: rows.map((row) => projectLead(row as LeadRow, entitlement)),
    total,
    unread,
    page: filters.page,
    pages: Math.max(1, Math.ceil(total / filters.perPage)),
    entitlement,
  };
}

export async function getSellerLead(
  sellerId: string,
  leadId: string,
): Promise<{ lead: LeadView; entitlement: Entitlement } | null> {
  const [row, entitlement] = await Promise.all([
    db.lead.findFirst({ where: { id: leadId, sellerId }, select: leadSelect }),
    getEntitlement(sellerId),
  ]);
  if (!row) return null;
  return { lead: projectLead(row as LeadRow, entitlement), entitlement };
}

/** NEW → VIEWED on first open. A no-op for every other status. */
export async function markLeadViewed(sellerId: string, leadId: string): Promise<void> {
  await db.lead.updateMany({
    where: { id: leadId, sellerId, status: "NEW" },
    data: { status: "VIEWED", viewedAt: new Date() },
  });
}

export type AcceptResult =
  | { ok: true; balanceAfter: number }
  | {
      ok: false;
      reason: "not_found" | "not_market" | "not_open" | "expired" | "insufficient_credits";
    };

/**
 * Accept a MARKET lead: debit one credit, reveal the buyer.
 *
 * The debit and the status flip are one transaction. Order matters — the
 * credit is taken first with a guarded UPDATE, so two concurrent accepts of
 * the same lead cannot both succeed: the second finds the lead no longer
 * NEW/VIEWED and its debit is never attempted.
 */
export async function acceptLead(params: {
  sellerId: string;
  leadId: string;
  actorId: string;
}): Promise<AcceptResult> {
  const lead = await db.lead.findFirst({
    where: { id: params.leadId, sellerId: params.sellerId },
    select: { type: true, status: true, expiresAt: true },
  });
  if (!lead) return { ok: false, reason: "not_found" };
  if (lead.type !== "MARKET") return { ok: false, reason: "not_market" };
  if (lead.status !== "NEW" && lead.status !== "VIEWED") return { ok: false, reason: "not_open" };
  if (lead.expiresAt && lead.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: "expired" };
  }

  return db
    .$transaction(async (tx) => {
      // Claim the lead first so a concurrent accept sees it taken.
      const claimed = await tx.lead.updateMany({
        where: {
          id: params.leadId,
          sellerId: params.sellerId,
          status: { in: ["NEW", "VIEWED"] },
          type: "MARKET",
        },
        data: {
          status: "ACCEPTED",
          masked: false,
          acceptedAt: new Date(),
          acceptedById: params.actorId,
        },
      });
      if (claimed.count !== 1) return { ok: false, reason: "not_open" } as const;

      const debit = await debitForAcceptWith(tx, params);
      if (!debit.ok) {
        // Throwing rolls the claim back with it.
        throw new InsufficientCredits();
      }

      await tx.seller.update({
        where: { id: params.sellerId },
        data: { leadsAccepted: { increment: 1 } },
      });

      return { ok: true, balanceAfter: debit.balanceAfter } as const;
    })
    .catch((error: unknown) => {
      if (error instanceof InsufficientCredits) {
        return { ok: false, reason: "insufficient_credits" } as const;
      }
      throw error;
    });
}

class InsufficientCredits extends Error {}

export async function closeLead(sellerId: string, leadId: string, note?: string): Promise<boolean> {
  const result = await db.lead.updateMany({
    where: { id: leadId, sellerId, status: { in: ["NEW", "VIEWED", "ACCEPTED"] } },
    data: { status: "CLOSED", closedAt: new Date(), ...(note ? { sellerNote: note } : {}) },
  });
  return result.count === 1;
}

export type FlagResult =
  { ok: true } | { ok: false; reason: "not_found" | "already_flagged" | "not_flaggable" };

/**
 * Flag a lead. One per lead. Any lead the seller has opened may be flagged
 * (spam reporting is useful on DIRECT too), but only an accepted MARKET lead
 * can lead to a refund — that is decided by the admin path, not here.
 */
export async function flagLead(params: {
  sellerId: string;
  leadId: string;
  reason: LeadFlagReason;
  note?: string;
}): Promise<FlagResult> {
  const lead = await db.lead.findFirst({
    where: { id: params.leadId, sellerId: params.sellerId },
    select: { status: true, flag: { select: { id: true } } },
  });
  if (!lead) return { ok: false, reason: "not_found" };
  if (lead.flag) return { ok: false, reason: "already_flagged" };
  if (lead.status === "NEW") return { ok: false, reason: "not_flaggable" };

  await db.leadFlag.create({
    data: {
      leadId: params.leadId,
      sellerId: params.sellerId,
      reason: params.reason,
      note: params.note ?? null,
    },
  });
  return { ok: true };
}

/** Balance, plan and the recent ledger for /dashboard/credits. */
export async function getCreditSummary(sellerId: string, take = 50) {
  const [entitlement, entries] = await Promise.all([
    getEntitlement(sellerId),
    db.creditLedger.findMany({
      where: { sellerId },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        delta: true,
        balanceAfter: true,
        reason: true,
        periodKey: true,
        note: true,
        createdAt: true,
        lead: { select: { id: true, requirement: { select: { productName: true } } } },
      },
    }),
  ]);
  return { entitlement, entries };
}

/** The plan ladder, for the credits page. Cheap and rarely changes. */
export async function listPlansForSeller() {
  return db.plan.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      key: true,
      name: true,
      priceMinor: true,
      currency: true,
      leadCreditsPerMonth: true,
    },
  });
}
