import "server-only";
import { db, Prisma } from "@/lib/db";

/**
 * Lead credits (docs/LEADS.md §4).
 *
 * `CreditLedger` is append-only and is the source of truth; `Seller.creditBalance`
 * caches SUM(delta) so the inbox can render a number without an aggregate.
 *
 * Every mutation here is one transaction that (1) moves the cached balance
 * with an atomic, guarded UPDATE and (2) inserts the ledger row carrying
 * `balanceAfter`. A debit that would go negative matches zero rows in step 1
 * and the transaction never reaches step 2. The CHECK constraints in the
 * migration are the backstop behind that.
 */

export type DebitResult =
  | { ok: true; balanceAfter: number; ledgerId: string }
  | { ok: false; reason: "insufficient_credits" | "already_charged" };

/**
 * The client `db.$transaction(fn)` hands to `fn`. Derived from the extended
 * client rather than `Prisma.TransactionClient`, which the retry extension
 * makes structurally different.
 */
export type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/** Charge one credit for accepting a MARKET lead. Idempotent per lead. */
export async function debitForAccept(params: {
  sellerId: string;
  leadId: string;
  actorId: string;
}): Promise<DebitResult> {
  return db.$transaction((tx) => debitForAcceptWith(tx, params));
}

/**
 * The same debit inside a caller-owned transaction, so accepting a lead can
 * flip the lead row and take the credit atomically (lead-inbox.service).
 */
export async function debitForAcceptWith(
  tx: TxClient,
  params: { sellerId: string; leadId: string; actorId: string },
): Promise<DebitResult> {
  {
    const already = await tx.creditLedger.findFirst({
      where: { leadId: params.leadId, reason: "LEAD_ACCEPT" },
      select: { id: true },
    });
    if (already) return { ok: false, reason: "already_charged" };

    const moved = await tx.seller.updateMany({
      where: { id: params.sellerId, creditBalance: { gte: 1 } },
      data: { creditBalance: { decrement: 1 } },
    });
    if (moved.count !== 1) return { ok: false, reason: "insufficient_credits" };

    const seller = await tx.seller.findUniqueOrThrow({
      where: { id: params.sellerId },
      select: { creditBalance: true },
    });

    const entry = await tx.creditLedger.create({
      data: {
        sellerId: params.sellerId,
        delta: -1,
        balanceAfter: seller.creditBalance,
        reason: "LEAD_ACCEPT",
        leadId: params.leadId,
        actorId: params.actorId,
      },
      select: { id: true },
    });

    return { ok: true, balanceAfter: seller.creditBalance, ledgerId: entry.id };
  }
}

/** Return the credit for a flagged lead. Idempotent per flag. */
export async function refundForFlag(params: {
  flagId: string;
  actorId: string;
  reviewNote?: string | null;
}): Promise<{ ok: true } | { ok: false; reason: "not_open" | "nothing_to_refund" }> {
  return db.$transaction(async (tx) => {
    const flag = await tx.leadFlag.findUnique({
      where: { id: params.flagId },
      select: {
        id: true,
        sellerId: true,
        leadId: true,
        status: true,
        lead: { select: { type: true, status: true } },
      },
    });
    if (!flag || flag.status !== "OPEN") return { ok: false, reason: "not_open" };

    // Only an accepted MARKET lead ever cost anything.
    const charge = await tx.creditLedger.findFirst({
      where: { leadId: flag.leadId, reason: "LEAD_ACCEPT" },
      select: { id: true },
    });
    if (!charge) return { ok: false, reason: "nothing_to_refund" };

    const seller = await tx.seller.update({
      where: { id: flag.sellerId },
      data: { creditBalance: { increment: 1 } },
      select: { creditBalance: true },
    });

    const entry = await tx.creditLedger.create({
      data: {
        sellerId: flag.sellerId,
        delta: 1,
        balanceAfter: seller.creditBalance,
        reason: "FLAG_REFUND",
        leadId: flag.leadId,
        leadFlagId: flag.id,
        actorId: params.actorId,
      },
      select: { id: true },
    });

    await tx.leadFlag.update({
      where: { id: flag.id },
      data: {
        status: "REFUNDED",
        reviewedById: params.actorId,
        reviewedAt: new Date(),
        reviewNote: params.reviewNote ?? null,
        refundLedgerId: entry.id,
      },
    });

    return { ok: true };
  });
}

/** Manual adjustment from the admin screen. Delta may be negative. */
export async function adjustCredits(params: {
  sellerId: string;
  delta: number;
  note: string;
  actorId: string;
}): Promise<{ ok: true; balanceAfter: number } | { ok: false; reason: "insufficient_credits" }> {
  if (params.delta === 0) throw new Error("adjustCredits: delta must be non-zero");

  return db.$transaction(async (tx) => {
    const moved = await tx.seller.updateMany({
      where: {
        id: params.sellerId,
        ...(params.delta < 0 ? { creditBalance: { gte: -params.delta } } : {}),
      },
      data: { creditBalance: { increment: params.delta } },
    });
    if (moved.count !== 1) return { ok: false, reason: "insufficient_credits" };

    const seller = await tx.seller.findUniqueOrThrow({
      where: { id: params.sellerId },
      select: { creditBalance: true },
    });

    await tx.creditLedger.create({
      data: {
        sellerId: params.sellerId,
        delta: params.delta,
        balanceAfter: seller.creditBalance,
        reason: "ADMIN_ADJUST",
        note: params.note,
        actorId: params.actorId,
      },
    });

    return { ok: true, balanceAfter: seller.creditBalance };
  });
}

/** "2026-09" for a date. Grants are keyed on this. */
export function periodKeyFor(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Grant every active subscription its plan's monthly credits for `periodKey`.
 *
 * Idempotent: the unique (sellerId, reason, periodKey) makes a second run for
 * the same month a provable no-op per seller — the transaction hits the
 * constraint and rolls back the balance move with it. Runs on the 1st, but a
 * missed or repeated run is harmless.
 */
export async function grantMonthlyCredits(
  periodKey: string,
): Promise<{ granted: number; skipped: number }> {
  const subscriptions = await db.subscription.findMany({
    where: {
      status: { in: ["ACTIVE", "TRIALING"] },
      seller: { deletedAt: null, status: { not: "BANNED" } },
      plan: { leadCreditsPerMonth: { gt: 0 } },
    },
    select: { id: true, sellerId: true, plan: { select: { leadCreditsPerMonth: true } } },
  });

  let granted = 0;
  let skipped = 0;

  // Sequential on purpose — this runs from cron against every paying seller,
  // and the point is correctness, not speed.
  for (const sub of subscriptions) {
    const amount = sub.plan.leadCreditsPerMonth ?? 0;
    if (amount <= 0) continue;

    try {
      await db.$transaction(async (tx) => {
        const seller = await tx.seller.update({
          where: { id: sub.sellerId },
          data: { creditBalance: { increment: amount } },
          select: { creditBalance: true },
        });
        await tx.creditLedger.create({
          data: {
            sellerId: sub.sellerId,
            delta: amount,
            balanceAfter: seller.creditBalance,
            reason: "MONTHLY_GRANT",
            subscriptionId: sub.id,
            periodKey,
          },
        });
      });
      granted += 1;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        skipped += 1; // already granted this period
        continue;
      }
      throw error;
    }
  }

  return { granted, skipped };
}

/**
 * Bring a seller up to their plan's monthly credits for the current period,
 * right now. Called on a plan change (D32) so an upgrade mid-month is usable
 * immediately instead of waiting for the 1st: the seller receives the
 * difference between the new plan's grant and whatever this period already
 * granted them (a Basic seller moving to Gold in a month where Basic's 10
 * were paid gets +30). Downgrades never claw back. Idempotent per period via
 * the ledger's (sellerId, reason, periodKey) for MONTHLY_GRANT.
 */
export async function topUpCreditsForPlanChange(params: {
  sellerId: string;
  subscriptionId: string;
  monthlyCredits: number | null;
  periodKey: string;
}): Promise<{ granted: number }> {
  const target = params.monthlyCredits ?? 0;
  if (target <= 0) return { granted: 0 };

  return db.$transaction(async (tx) => {
    const already = await tx.creditLedger.aggregate({
      where: {
        sellerId: params.sellerId,
        periodKey: params.periodKey,
        reason: { in: ["MONTHLY_GRANT", "ADMIN_ADJUST"] },
        delta: { gt: 0 },
      },
      _sum: { delta: true },
    });
    const owed = target - (already._sum.delta ?? 0);
    if (owed <= 0) return { granted: 0 };

    const hasMonthly = await tx.creditLedger.findFirst({
      where: { sellerId: params.sellerId, reason: "MONTHLY_GRANT", periodKey: params.periodKey },
      select: { id: true },
    });

    const seller = await tx.seller.update({
      where: { id: params.sellerId },
      data: { creditBalance: { increment: owed } },
      select: { creditBalance: true },
    });
    await tx.creditLedger.create({
      data: {
        sellerId: params.sellerId,
        delta: owed,
        balanceAfter: seller.creditBalance,
        // The period's MONTHLY_GRANT slot is unique; a top-up on top of an
        // earlier grant is recorded as an adjustment with the same periodKey.
        reason: hasMonthly ? "ADMIN_ADJUST" : "MONTHLY_GRANT",
        subscriptionId: params.subscriptionId,
        periodKey: params.periodKey,
        note: hasMonthly ? `Plan change top-up for ${params.periodKey}` : null,
      },
    });
    return { granted: owed };
  });
}
