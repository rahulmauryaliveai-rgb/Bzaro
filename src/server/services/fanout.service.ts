import "server-only";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import {
  DEFAULT_LEAD_SETTINGS,
  LEAD_SETTINGS_KEY,
  leadSettingsSchema,
} from "@/lib/validation/lead-settings";
import { findMatchedSellers } from "@/server/services/matching.service";

/**
 * MARKET fan-out — the worker-side half of the lead system (docs/LEADS.md §2, §5).
 *
 * `claimNextRequirement` and `processRequirement` are separate so the worker
 * can hold the claim (RUNNING) across the matcher without a long transaction:
 * the claim is a single guarded UPDATE, the work runs outside any lock, and
 * the result is written in its own short transaction.
 */

export const FANOUT_MAX_ATTEMPTS = 3;

export function getLeadSettings() {
  return getSetting(LEAD_SETTINGS_KEY, leadSettingsSchema, DEFAULT_LEAD_SETTINGS);
}

/**
 * Claim the oldest PENDING requirement. `FOR UPDATE SKIP LOCKED` lets several
 * worker processes poll the same table without ever claiming the same row.
 */
export async function claimNextRequirement(): Promise<string | null> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    UPDATE "Requirement"
       SET "fanoutStatus" = 'RUNNING',
           "fanoutAttempts" = "fanoutAttempts" + 1,
           "updatedAt" = now()
     WHERE id = (
       SELECT id FROM "Requirement"
        WHERE "fanoutStatus" = 'PENDING'
        ORDER BY "createdAt"
        FOR UPDATE SKIP LOCKED
        LIMIT 1
     )
     RETURNING id`;
  return rows[0]?.id ?? null;
}

export type FanoutOutcome =
  | { status: "DONE"; leads: number }
  | { status: "SKIPPED"; reason: "duplicate" | "no_candidates" | "not_found" };

/** Run the matcher for one claimed requirement and write the MARKET leads. */
export async function processRequirement(requirementId: string): Promise<FanoutOutcome> {
  const requirement = await db.requirement.findUnique({
    where: { id: requirementId },
    select: {
      id: true,
      buyerId: true,
      categoryId: true,
      locationId: true,
      directSellerId: true,
      fingerprint: true,
      createdAt: true,
    },
  });
  if (!requirement) return { status: "SKIPPED", reason: "not_found" };

  const settings = await getLeadSettings();

  // ── 7-day dedupe ───────────────────────────────────────────────────────────
  // Same buyer, same fingerprint, already fanned out inside the window → the
  // DIRECT lead they just created stands, but no second round of MARKET leads.
  if (settings.dedupeDays > 0) {
    const since = new Date(requirement.createdAt.getTime() - settings.dedupeDays * 86_400_000);
    const duplicate = await db.requirement.findFirst({
      where: {
        id: { not: requirement.id },
        buyerId: requirement.buyerId,
        fingerprint: requirement.fingerprint,
        fanoutStatus: "DONE",
        createdAt: { gte: since },
      },
      select: { id: true },
    });
    if (duplicate) {
      await markFanout(requirement.id, "SKIPPED", "duplicate within dedupe window");
      return { status: "SKIPPED", reason: "duplicate" };
    }
  }

  // ── Match ──────────────────────────────────────────────────────────────────
  const ranked = await findMatchedSellers(
    {
      categoryId: requirement.categoryId,
      locationId: requirement.locationId,
      excludeSellerId: requirement.directSellerId,
    },
    settings,
  );

  if (ranked.length === 0) {
    await markFanout(requirement.id, "SKIPPED", "no eligible sellers");
    return { status: "SKIPPED", reason: "no_candidates" };
  }

  // ── Write ──────────────────────────────────────────────────────────────────
  const expiresAt = new Date(Date.now() + settings.market.expiryHours * 3_600_000);

  await db.$transaction(async (tx) => {
    for (const candidate of ranked) {
      // A seller may already hold this requirement (worker retry after a
      // partial failure). The unique (requirementId, sellerId) would reject a
      // second create; checking first also keeps leadsReceived honest.
      const existing = await tx.lead.findUnique({
        where: {
          requirementId_sellerId: { requirementId: requirement.id, sellerId: candidate.sellerId },
        },
        select: { id: true },
      });
      if (existing) continue;

      await tx.lead.create({
        data: {
          requirementId: requirement.id,
          sellerId: candidate.sellerId,
          type: "MARKET",
          status: "NEW",
          masked: true,
          score: candidate.score,
          rank: candidate.rank,
          expiresAt,
          deliveries: { create: [{ channel: "PANEL" }] },
        },
        select: { id: true },
      });

      await tx.seller.update({
        where: { id: candidate.sellerId },
        data: { leadsReceived: { increment: 1 } },
      });
    }

    await tx.requirement.update({
      where: { id: requirement.id },
      data: { fanoutStatus: "DONE", fanoutAt: new Date(), fanoutError: null },
    });
  });

  return { status: "DONE", leads: ranked.length };
}

/** Called by the worker when processRequirement throws. */
export async function failRequirement(requirementId: string, error: unknown): Promise<void> {
  const message =
    error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
  const row = await db.requirement.findUnique({
    where: { id: requirementId },
    select: { fanoutAttempts: true },
  });
  const exhausted = (row?.fanoutAttempts ?? FANOUT_MAX_ATTEMPTS) >= FANOUT_MAX_ATTEMPTS;
  await db.requirement.update({
    where: { id: requirementId },
    data: {
      fanoutStatus: exhausted ? "FAILED" : "PENDING",
      fanoutError: message,
      ...(exhausted ? { fanoutAt: new Date() } : {}),
    },
  });
}

async function markFanout(
  requirementId: string,
  status: "SKIPPED" | "FAILED",
  note: string,
): Promise<void> {
  await db.requirement.update({
    where: { id: requirementId },
    data: { fanoutStatus: status, fanoutAt: new Date(), fanoutError: note },
  });
}

/**
 * Expire MARKET leads nobody accepted (docs/LEADS.md §2). ACCEPTED leads never
 * expire; DIRECT leads have no expiresAt.
 */
export async function expireMarketLeads(now = new Date()): Promise<number> {
  const result = await db.lead.updateMany({
    where: { type: "MARKET", status: { in: ["NEW", "VIEWED"] }, expiresAt: { lt: now } },
    data: { status: "EXPIRED" },
  });
  return result.count;
}

/**
 * Recompute responseRate / leadsReceived / leadsAccepted from the leads table.
 * The accept path maintains them inline; this catches drift, exactly like
 * refresh-counters does for productCount.
 *
 * responseRate stays null below MIN_HISTORY market leads so a seller's first
 * unanswered lead cannot pin them to 0.
 */
export const RESPONSE_RATE_MIN_HISTORY = 3;

export async function refreshLeadStats(): Promise<{ sellers: number; corrected: number }> {
  const grouped = await db.lead.groupBy({
    by: ["sellerId", "status"],
    where: { type: "MARKET" },
    _count: { _all: true },
  });

  const totals = new Map<string, { received: number; accepted: number }>();
  for (const row of grouped) {
    const entry = totals.get(row.sellerId) ?? { received: 0, accepted: 0 };
    entry.received += row._count._all;
    if (row.status === "ACCEPTED") entry.accepted += row._count._all;
    totals.set(row.sellerId, entry);
  }

  let corrected = 0;
  for (const [sellerId, { received, accepted }] of totals) {
    const responseRate = received >= RESPONSE_RATE_MIN_HISTORY ? accepted / received : null;
    const seller = await db.seller.findUnique({
      where: { id: sellerId },
      select: { leadsReceived: true, leadsAccepted: true, responseRate: true },
    });
    if (!seller) continue;
    if (
      seller.leadsReceived !== received ||
      seller.leadsAccepted !== accepted ||
      seller.responseRate !== responseRate
    ) {
      await db.seller.update({
        where: { id: sellerId },
        data: { leadsReceived: received, leadsAccepted: accepted, responseRate },
      });
      corrected += 1;
    }
  }

  return { sellers: totals.size, corrected };
}
