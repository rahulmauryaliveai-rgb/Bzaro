import "server-only";
import { db, Prisma } from "@/lib/db";
import {
  cancelGatewaySubscription,
  isBillingGatewayConfigured,
  refundGatewayPayment,
} from "@/lib/payments/billing-gateway";
import { getBillingSettings } from "@/server/services/billing.service";
import { recomputeWebPresence } from "@/server/services/plan.service";

/**
 * Plan refunds (decision D41).
 *
 * The one refundable case: "I am not getting leads in my product or service
 * category". The seller asks from the billing page within `refundWindowDays`
 * of a plan payment; the request records how many market leads they actually
 * received since paying, so the admin decides on evidence rather than on the
 * claim alone. Approval refunds that payment through Razorpay, cancels the
 * subscription and drops the seller to Free. Add-ons are not refundable.
 */

export const REFUND_REASONS = [
  "No leads in my product or service category",
  "Leads received are not related to my products or services",
] as const;

export type RefundableCandidate = {
  paymentId: string;
  amountMinor: number;
  paidAt: Date;
  planName: string;
  deadline: Date;
};

/** The plan payment a seller could ask to refund right now, if any. */
export async function getRefundableCandidate(sellerId: string): Promise<RefundableCandidate | null> {
  const settings = await getBillingSettings();
  if (settings.refundWindowDays <= 0) return null;
  const since = new Date(Date.now() - settings.refundWindowDays * 86_400_000);
  const payment = await db.payment.findFirst({
    where: {
      sellerId,
      status: "captured",
      refundedMinor: 0,
      paidAt: { gte: since },
      refunds: { none: {} },
    },
    orderBy: { paidAt: "desc" },
    select: {
      id: true,
      amountMinor: true,
      paidAt: true,
      subscription: { select: { plan: { select: { name: true } } } },
    },
  });
  if (!payment?.paidAt) return null;
  return {
    paymentId: payment.id,
    amountMinor: payment.amountMinor,
    paidAt: payment.paidAt,
    planName: payment.subscription.plan.name,
    deadline: new Date(payment.paidAt.getTime() + settings.refundWindowDays * 86_400_000),
  };
}

export async function requestRefund(params: {
  sellerId: string;
  userId: string;
  paymentId: string;
  reason: string;
  details: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const candidate = await getRefundableCandidate(params.sellerId);
  if (!candidate || candidate.paymentId !== params.paymentId) {
    return { ok: false, error: "This payment is outside the refund window or already has a request." };
  }
  if (!(REFUND_REASONS as readonly string[]).includes(params.reason)) {
    return { ok: false, error: "Choose a reason." };
  }
  const leadsInWindow = await db.lead.count({
    where: { sellerId: params.sellerId, type: "MARKET", createdAt: { gte: candidate.paidAt } },
  });
  try {
    const request = await db.refundRequest.create({
      data: {
        sellerId: params.sellerId,
        paymentId: params.paymentId,
        reason: params.reason,
        details: params.details,
        leadsInWindow,
        amountMinor: candidate.amountMinor,
        requestedById: params.userId,
      },
      select: { id: true },
    });
    await db.auditLog.create({
      data: {
        actorId: params.userId,
        sellerId: params.sellerId,
        action: "billing.refund_requested",
        entityType: "RefundRequest",
        entityId: request.id,
        after: { reason: params.reason, leadsInWindow },
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "A refund request for this payment is already open." };
    }
    throw error;
  }
  return { ok: true };
}

export function listRefundRequests(status?: "REQUESTED" | "REFUNDED" | "REJECTED" | "FAILED") {
  return db.refundRequest.findMany({
    where: status ? { status } : {},
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
    select: {
      id: true,
      status: true,
      reason: true,
      details: true,
      leadsInWindow: true,
      amountMinor: true,
      adminNote: true,
      createdAt: true,
      reviewedAt: true,
      gatewayRefundId: true,
      seller: {
        select: {
          id: true,
          slug: true,
          businessName: true,
          categories: { select: { category: { select: { name: true } } } },
        },
      },
      payment: {
        select: {
          invoiceNumber: true,
          paidAt: true,
          gatewayPaymentId: true,
          subscription: { select: { plan: { select: { name: true } } } },
        },
      },
    },
  });
}

export async function rejectRefund(params: { id: string; adminId: string; note: string | null }) {
  const updated = await db.refundRequest.updateMany({
    where: { id: params.id, status: "REQUESTED" },
    data: { status: "REJECTED", adminNote: params.note, reviewedById: params.adminId, reviewedAt: new Date() },
  });
  return updated.count === 1;
}

/**
 * Approve: claim the request, refund at Razorpay, end the subscription. A
 * payment recorded without a gateway id (paid by UPI transfer and entered by
 * hand) is marked REFUNDED with a note — the money goes back by hand too.
 */
export async function approveRefund(params: {
  id: string;
  adminId: string;
  note: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const claimed = await db.refundRequest.updateMany({
    where: { id: params.id, status: "REQUESTED" },
    data: { status: "APPROVED", reviewedById: params.adminId, reviewedAt: new Date(), adminNote: params.note },
  });
  if (claimed.count !== 1) return { ok: false, error: "This request was already handled." };

  const request = await db.refundRequest.findUniqueOrThrow({
    where: { id: params.id },
    select: {
      id: true,
      sellerId: true,
      amountMinor: true,
      payment: {
        select: {
          id: true,
          gatewayPaymentId: true,
          subscription: { select: { id: true, gatewaySubscriptionId: true } },
        },
      },
    },
  });

  let gatewayRefundId: string | null = null;
  if (request.payment.gatewayPaymentId) {
    if (!isBillingGatewayConfigured()) {
      await db.refundRequest.update({ where: { id: request.id }, data: { status: "REQUESTED" } });
      return { ok: false, error: "Razorpay billing keys are not configured." };
    }
    const refund = await refundGatewayPayment(request.payment.gatewayPaymentId, request.amountMinor, {
      refundRequestId: request.id,
    });
    if (!refund.ok) {
      await db.refundRequest.update({
        where: { id: request.id },
        data: { status: "FAILED", adminNote: `${params.note ?? ""}\nRazorpay: ${refund.error}`.trim() },
      });
      return { ok: false, error: `Razorpay: ${refund.error}` };
    }
    gatewayRefundId = refund.data.id;
  }

  const now = new Date();
  await db.$transaction([
    db.refundRequest.update({
      where: { id: request.id },
      data: {
        status: "REFUNDED",
        gatewayRefundId,
        ...(gatewayRefundId ? {} : { adminNote: `${params.note ?? ""}\nNo gateway payment — refund by hand.`.trim() }),
      },
    }),
    db.payment.update({
      where: { id: request.payment.id },
      data: { refundedMinor: { increment: request.amountMinor }, status: "refunded" },
    }),
    db.subscription.update({
      where: { id: request.payment.subscription.id },
      data: { status: "CANCELED", canceledAt: now, cancelAtPeriodEnd: false },
    }),
    db.auditLog.create({
      data: {
        actorId: params.adminId,
        sellerId: request.sellerId,
        action: "billing.refund_approved",
        entityType: "RefundRequest",
        entityId: request.id,
        after: { amountMinor: request.amountMinor, gatewayRefundId },
      },
    }),
  ]);

  if (request.payment.subscription.gatewaySubscriptionId) {
    await cancelGatewaySubscription(request.payment.subscription.gatewaySubscriptionId, false).catch(
      () => undefined,
    );
  }
  await recomputeWebPresence(request.sellerId, db, "immediate");
  return { ok: true };
}

/** Webhook: Razorpay reports the refund failed after we recorded it. */
export async function markGatewayRefundFailed(gatewayRefundId: string, reason: string) {
  await db.refundRequest.updateMany({
    where: { gatewayRefundId },
    data: { status: "FAILED", adminNote: `Razorpay refund failed: ${reason}`.slice(0, 1000) },
  });
}
