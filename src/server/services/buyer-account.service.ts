import "server-only";
import type { LeadStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { mailer } from "@/lib/mail";
import { supplierRespondedEmail } from "@/lib/mail/templates";
import { marketplaceUrl } from "@/lib/utils/url";

/**
 * The buyer's own account hub (/account).
 *
 * Every query here is scoped by `buyerId = userId` — the only thing standing
 * between one buyer and another buyer's sourcing — so callers pass the id of
 * the signed-in user and nothing else.
 *
 * Disclosure rule (docs/LEADS.md): a buyer sees the suppliers who ENGAGED with
 * their requirement — viewed it, or accepted it. The rest are a count. Handing
 * buyers the full recipient list would invite them to go around Bzaro and
 * would expose sellers who never chose to respond.
 */

/** A lead the seller has taken up: the buyer may contact them. */
export const RESPONDED_STATUSES: LeadStatus[] = ["ACCEPTED", "CONTACTED", "WON"];

export type RequirementProgress = {
  sent: number;
  viewed: number;
  responded: number;
};

function progressOf(
  leads: Array<{ status: LeadStatus; viewedAt: Date | null }>,
): RequirementProgress {
  let viewed = 0;
  let responded = 0;
  for (const lead of leads) {
    const hasResponded = RESPONDED_STATUSES.includes(lead.status);
    if (hasResponded) responded += 1;
    if (hasResponded || lead.viewedAt || lead.status === "VIEWED") viewed += 1;
  }
  return { sent: leads.length, viewed, responded };
}

// ── Sidebar / header ─────────────────────────────────────────────────────────

export type BuyerAccountSummary = {
  name: string | null;
  email: string;
  city: string | null;
  counts: { requirements: number; activeRequirements: number; saved: number; orders: number };
};

export async function getBuyerAccountSummary(userId: string): Promise<BuyerAccountSummary | null> {
  const [user, requirements, activeRequirements, saved, orders] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        email: true,
        buyerProfile: { select: { location: { select: { name: true } } } },
      },
    }),
    db.requirement.count({ where: { buyerId: userId } }),
    db.requirement.count({ where: { buyerId: userId, closedAt: null } }),
    db.savedSeller.count({
      where: { buyerId: userId, seller: { status: "VERIFIED", deletedAt: null } },
    }),
    db.order.count({ where: { buyerId: userId } }),
  ]);
  if (!user) return null;

  return {
    name: user.name,
    email: user.email,
    city: user.buyerProfile?.location?.name ?? null,
    counts: { requirements, activeRequirements, saved, orders },
  };
}

// ── Overview ─────────────────────────────────────────────────────────────────

export type ActivityItem = {
  at: Date;
  kind: "responded" | "viewed";
  sellerName: string;
  requirementId: string;
  productName: string;
};

export async function getBuyerOverview(userId: string) {
  const [responses, latest, recentLeads] = await Promise.all([
    db.lead.count({
      where: { requirement: { buyerId: userId }, status: { in: RESPONDED_STATUSES } },
    }),
    db.requirement.findFirst({
      where: { buyerId: userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        productName: true,
        quantity: true,
        quantityUnit: true,
        createdAt: true,
        closedAt: true,
        category: { select: { name: true } },
        location: { select: { name: true } },
        leads: { select: { status: true, viewedAt: true } },
      },
    }),
    db.lead.findMany({
      where: {
        requirement: { buyerId: userId },
        OR: [{ acceptedAt: { not: null } }, { viewedAt: { not: null } }],
      },
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: {
        status: true,
        viewedAt: true,
        acceptedAt: true,
        seller: { select: { businessName: true } },
        requirement: { select: { id: true, productName: true } },
      },
    }),
  ]);

  const activity: ActivityItem[] = recentLeads
    .map((lead) => {
      const responded = RESPONDED_STATUSES.includes(lead.status) && lead.acceptedAt;
      const at = responded ? lead.acceptedAt : lead.viewedAt;
      if (!at) return null;
      return {
        at,
        kind: responded ? "responded" : "viewed",
        sellerName: lead.seller.businessName,
        requirementId: lead.requirement.id,
        productName: lead.requirement.productName,
      } satisfies ActivityItem;
    })
    .filter((item): item is ActivityItem => item !== null)
    .sort((a, b) => b.at.getTime() - a.at.getTime());

  return {
    responses,
    latest: latest ? { ...latest, progress: progressOf(latest.leads) } : null,
    activity,
  };
}

// ── Requirements ─────────────────────────────────────────────────────────────

export async function listBuyerRequirements(userId: string) {
  const rows = await db.requirement.findMany({
    where: { buyerId: userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      productName: true,
      quantity: true,
      quantityUnit: true,
      timeline: true,
      purpose: true,
      createdAt: true,
      closedAt: true,
      category: { select: { name: true } },
      location: { select: { name: true } },
      leads: { select: { status: true, viewedAt: true } },
    },
  });
  return rows.map((row) => ({ ...row, progress: progressOf(row.leads) }));
}

export type RequirementSupplier = {
  leadId: string;
  sellerName: string;
  sellerSlug: string;
  city: string | null;
  verified: boolean;
  state: "responded" | "viewed";
  at: Date;
  /** Only once the seller has responded (or the buyer contacted them directly). */
  phone: string | null;
  whatsapp: string | null;
};

export async function getBuyerRequirement(userId: string, requirementId: string) {
  const requirement = await db.requirement.findFirst({
    where: { id: requirementId, buyerId: userId },
    select: {
      id: true,
      productName: true,
      quantity: true,
      quantityUnit: true,
      timeline: true,
      purpose: true,
      notes: true,
      businessName: true,
      gstin: true,
      trigger: true,
      createdAt: true,
      closedAt: true,
      category: { select: { name: true } },
      location: { select: { name: true } },
      leads: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          type: true,
          status: true,
          viewedAt: true,
          acceptedAt: true,
          createdAt: true,
          seller: {
            select: {
              slug: true,
              businessName: true,
              status: true,
              phone: true,
              whatsapp: true,
              location: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (!requirement) return null;

  const directSeller = requirement.leads.find((lead) => lead.type === "DIRECT")?.seller ?? null;

  const suppliers: RequirementSupplier[] = [];
  for (const lead of requirement.leads) {
    const responded = RESPONDED_STATUSES.includes(lead.status);
    // The seller the buyer contacted directly is always shown: they already
    // chose them, and usually already have their WhatsApp.
    const engaged = responded || lead.viewedAt !== null || lead.type === "DIRECT";
    if (!engaged) continue;
    const unlocked = responded || lead.type === "DIRECT";
    suppliers.push({
      leadId: lead.id,
      sellerName: lead.seller.businessName,
      sellerSlug: lead.seller.slug,
      city: lead.seller.location?.name ?? null,
      verified: lead.seller.status === "VERIFIED",
      state: responded ? "responded" : "viewed",
      at: (responded ? lead.acceptedAt : lead.viewedAt) ?? lead.createdAt,
      phone: unlocked ? lead.seller.phone : null,
      whatsapp: unlocked ? lead.seller.whatsapp : null,
    });
  }
  suppliers.sort((a, b) =>
    a.state === b.state ? b.at.getTime() - a.at.getTime() : a.state === "responded" ? -1 : 1,
  );

  const firstViewed = requirement.leads
    .map((lead) => lead.viewedAt)
    .filter((date): date is Date => date !== null)
    .sort((a, b) => a.getTime() - b.getTime())[0];
  const firstResponded = requirement.leads
    .filter((lead) => RESPONDED_STATUSES.includes(lead.status))
    .map((lead) => lead.acceptedAt)
    .filter((date): date is Date => date !== null)
    .sort((a, b) => a.getTime() - b.getTime())[0];

  return {
    ...requirement,
    directSellerName: directSeller?.businessName ?? null,
    progress: progressOf(requirement.leads),
    milestones: {
      viewedAt: firstViewed ?? null,
      respondedAt: firstResponded ?? null,
    },
    suppliers,
    hiddenCount: requirement.leads.length - suppliers.length,
  };
}

/**
 * "I found a supplier". Also closes the leads nobody has taken up yet, so no
 * seller pays a credit for a requirement that is already filled. Leads a seller
 * already accepted keep their status — that conversation is theirs.
 */
export async function closeBuyerRequirement(
  userId: string,
  requirementId: string,
): Promise<boolean> {
  const now = new Date();
  return db.$transaction(async (tx) => {
    const closed = await tx.requirement.updateMany({
      where: { id: requirementId, buyerId: userId, closedAt: null },
      data: { closedAt: now },
    });
    if (closed.count !== 1) return false;
    await tx.lead.updateMany({
      where: { requirementId, status: { in: ["NEW", "VIEWED"] } },
      data: { status: "CLOSED", closedAt: now },
    });
    return true;
  });
}

// ── Profile ──────────────────────────────────────────────────────────────────

export async function getBuyerProfile(userId: string) {
  return db.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      email: true,
      phone: true,
      role: true,
      passwordHash: true,
      accounts: { select: { provider: true } },
      buyerProfile: { select: { locationId: true, notifyOnResponse: true } },
    },
  });
}

export async function updateBuyerProfile(
  userId: string,
  data: { name: string; locationId: string | null; notifyOnResponse: boolean },
): Promise<void> {
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { name: data.name } }),
    db.buyerProfile.upsert({
      where: { userId },
      create: { userId, locationId: data.locationId, notifyOnResponse: data.notifyOnResponse },
      update: { locationId: data.locationId, notifyOnResponse: data.notifyOnResponse },
    }),
  ]);
}

/**
 * Delete a buyer account (Privacy Policy §6).
 *
 * Personal data is erased and the row anonymised rather than hard-deleted:
 * requirements already delivered to sellers reference it, and the policy is
 * explicit that those cannot be recalled. Sessions die on the next request
 * (the jwt callback rejects deleted users). Seller and admin accounts are
 * refused — they own a business and go through support.
 */
export async function deleteBuyerAccount(
  userId: string,
): Promise<{ ok: true } | { ok: false; reason: "not_buyer" }> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user || user.role !== "BUYER") return { ok: false, reason: "not_buyer" };

  const now = new Date();
  await db.$transaction([
    db.account.deleteMany({ where: { userId } }),
    db.savedSeller.deleteMany({ where: { buyerId: userId } }),
    db.buyerProfile.deleteMany({ where: { userId } }),
    db.user.update({
      where: { id: userId },
      data: {
        email: `deleted+${userId}@deleted.bzaro.invalid`,
        emailVerified: null,
        name: null,
        phone: null,
        phoneVerified: null,
        whatsapp: null,
        image: null,
        passwordHash: null,
        isActive: false,
        deletedAt: now,
        sessionsInvalidAfter: now,
      },
    }),
    db.auditLog.create({ data: { actorId: userId, action: "buyer.account_deleted" } }),
  ]);
  return { ok: true };
}

// ── Notifications ────────────────────────────────────────────────────────────

/**
 * Tell the buyer a supplier accepted their requirement. Best effort: a mail
 * failure must never undo or fail the seller's accept.
 */
export async function notifyBuyerOfResponse(leadId: string): Promise<void> {
  try {
    const lead = await db.lead.findUnique({
      where: { id: leadId },
      select: {
        seller: { select: { businessName: true } },
        requirement: {
          select: {
            id: true,
            productName: true,
            buyer: {
              select: {
                email: true,
                name: true,
                isActive: true,
                deletedAt: true,
                buyerProfile: { select: { notifyOnResponse: true } },
              },
            },
          },
        },
      },
    });
    const buyer = lead?.requirement.buyer;
    if (!lead || !buyer || !buyer.isActive || buyer.deletedAt) return;
    if (buyer.buyerProfile && !buyer.buyerProfile.notifyOnResponse) return;

    await mailer.send(
      supplierRespondedEmail({
        to: buyer.email,
        buyerName: buyer.name,
        sellerName: lead.seller.businessName,
        productName: lead.requirement.productName,
        url: marketplaceUrl(`/account/requirements/${lead.requirement.id}`),
      }),
    );
  } catch (error) {
    console.error("[buyer] response notification failed", error);
  }
}
