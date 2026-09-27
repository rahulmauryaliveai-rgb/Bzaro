import Link from "next/link";
import { requirePermission } from "@/lib/auth/guards";
import { formatMoney } from "@/lib/utils/money";
import { listRefundRequests } from "@/server/services/refund.service";
import { reviewRefundAction } from "@/server/actions/billing";

/**
 * Refund queue (D41). A seller asks when leads are not arriving for their
 * categories; the request carries how many market leads they actually got
 * since paying, and the categories they are listed in, so the decision is
 * made on evidence. Approve refunds the payment through Razorpay, cancels the
 * subscription and moves the seller to Free.
 */

const STATUS_STYLE: Record<string, string> = {
  REQUESTED: "bg-amber-900/50 text-amber-200",
  APPROVED: "bg-sky-900/50 text-sky-200",
  REFUNDED: "bg-green-900/50 text-green-200",
  REJECTED: "bg-neutral-700 text-neutral-300",
  FAILED: "bg-red-900/50 text-red-200",
};

export default async function AdminRefundsPage() {
  await requirePermission("admin:subscription:manage");
  const requests = await listRefundRequests();

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight">Refund requests</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Plan refunds are offered only when a seller is not getting leads in their product or service
        category. Check the lead count and categories before approving. Approving refunds the full
        payment and moves the seller to Free.
      </p>

      {requests.length === 0 ? (
        <p className="mt-8 text-sm text-neutral-400">No refund requests yet.</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {requests.map((request) => (
            <li
              key={request.id}
              className="rounded-lg border border-neutral-700 bg-neutral-800 p-5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <Link
                    href={`/admin/sellers/${request.seller.id}`}
                    className="text-base font-semibold hover:underline"
                  >
                    {request.seller.businessName}
                  </Link>
                  <span className="ml-2 text-xs text-neutral-400">{request.seller.slug}</span>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[request.status] ?? ""}`}
                >
                  {request.status}
                </span>
              </div>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-neutral-500">Amount</dt>
                  <dd className="tabular-nums">{formatMoney(request.amountMinor, "INR")}</dd>
                </div>
                <div>
                  <dt className="text-xs text-neutral-500">Plan · invoice</dt>
                  <dd>
                    {request.payment.subscription.plan.name} ·{" "}
                    {request.payment.invoiceNumber ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-neutral-500">Paid</dt>
                  <dd>{request.payment.paidAt?.toLocaleDateString("en-IN") ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-neutral-500">Market leads since paying</dt>
                  <dd className="font-semibold tabular-nums">{request.leadsInWindow}</dd>
                </div>
              </dl>
              <p className="mt-3 text-sm">
                <span className="text-neutral-500">Reason:</span> {request.reason}
              </p>
              {request.details ? (
                <p className="mt-1 text-sm whitespace-pre-line text-neutral-300">
                  {request.details}
                </p>
              ) : null}
              <p className="mt-1 text-xs text-neutral-500">
                Categories:{" "}
                {request.seller.categories.map((c) => c.category.name).join(", ") || "none"}
              </p>
              {request.adminNote ? (
                <p className="mt-2 text-xs whitespace-pre-line text-neutral-400">
                  Note: {request.adminNote}
                </p>
              ) : null}

              {request.status === "REQUESTED" ? (
                <form action={reviewRefundAction} className="mt-4 flex flex-wrap items-end gap-3">
                  <input type="hidden" name="id" value={request.id} />
                  <label className="flex min-w-64 flex-1 flex-col gap-1 text-sm">
                    <span className="text-xs text-neutral-500">Note to keep (optional)</span>
                    <input
                      name="note"
                      maxLength={1000}
                      className="rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1.5"
                    />
                  </label>
                  <button
                    type="submit"
                    name="decision"
                    value="approve"
                    className="rounded-md bg-white px-4 py-1.5 text-sm font-medium text-neutral-900 hover:bg-neutral-200"
                  >
                    Approve &amp; refund
                  </button>
                  <button
                    type="submit"
                    name="decision"
                    value="reject"
                    className="rounded-md border border-neutral-600 px-4 py-1.5 text-sm hover:bg-neutral-700"
                  >
                    Reject
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
