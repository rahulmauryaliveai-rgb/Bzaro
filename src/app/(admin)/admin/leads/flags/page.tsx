import Link from "next/link";
import { requirePermission } from "@/lib/auth/guards";
import { listLeadFlags } from "@/server/services/admin-leads.service";
import { resolveFlagAction } from "@/server/actions/admin-leads";
import { FLAG_REASON_LABELS } from "@/lib/validation/lead";
import { formatPhone } from "@/lib/buyer/phone";

/**
 * The refund queue (docs/LEADS.md §4).
 *
 * Refund puts the credit back through the ledger; Reject records the review.
 * A flag on a lead that was never charged (DIRECT, or never accepted) can
 * only be rejected — the action handles that case even if Refund is pressed.
 */
export default async function LeadFlagsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await requirePermission("admin:lead:refund");

  const query = await searchParams;
  const status =
    query.status === "REFUNDED" || query.status === "REJECTED" || query.status === "OPEN"
      ? query.status
      : query.status === "all"
        ? undefined
        : "OPEN";
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const data = await listLeadFlags(status, page);

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">Lead flags</h1>
      <p className="mt-1 text-sm text-neutral-400">
        <span className="tabular-nums">{data.open}</span> open
      </p>

      <nav className="mt-4 flex gap-2 text-xs">
        {[
          ["OPEN", "Open"],
          ["REFUNDED", "Refunded"],
          ["REJECTED", "Rejected"],
          ["all", "All"],
        ].map(([value, label]) => (
          <Link
            key={value}
            href={`/admin/leads/flags?status=${value}`}
            className={`rounded-full border px-2.5 py-1 ${
              (status ?? "all") === value
                ? "border-white bg-white text-neutral-900"
                : "border-neutral-700 text-neutral-300 hover:bg-neutral-800"
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {data.items.length === 0 ? (
        <p className="mt-8 rounded-lg border border-dashed border-neutral-700 p-8 text-center text-sm text-neutral-400">
          Nothing here.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {data.items.map((flag) => {
            const charged = flag.lead.creditEntries.length > 0;
            const r = flag.lead.requirement;
            return (
              <li
                key={flag.id}
                className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      <Link href={`/admin/sellers/${flag.seller.id}`} className="hover:underline">
                        {flag.seller.businessName}
                      </Link>{" "}
                      <span className="font-normal text-neutral-400">
                        flagged a {flag.lead.type.toLowerCase()} lead ·{" "}
                        {FLAG_REASON_LABELS[flag.reason]}
                      </span>
                    </p>
                    <p className="mt-1 text-neutral-300">
                      {r.productName} · {r.quantity} {r.quantityUnit} · {r.location.name}
                    </p>
                    <p className="mt-1 text-neutral-400">
                      Buyer {r.buyer.phone ? formatPhone(r.buyer.phone) : "—"}
                      {r.buyer.name ? ` (${r.buyer.name})` : ""} · lead{" "}
                      {flag.lead.status.toLowerCase()}
                      {charged ? " · 1 credit charged" : " · no credit charged"}
                    </p>
                    {flag.note ? (
                      <p className="mt-2 rounded bg-neutral-900 px-2 py-1 text-neutral-300">
                        “{flag.note}”
                      </p>
                    ) : null}
                  </div>
                  <span className="text-xs text-neutral-500">
                    <time dateTime={flag.createdAt.toISOString()}>
                      {flag.createdAt.toLocaleString("en-IN")}
                    </time>
                  </span>
                </div>

                {flag.status === "OPEN" ? (
                  <form action={resolveFlagAction} className="mt-3 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="flagId" value={flag.id} />
                    <label className="flex-1 text-xs text-neutral-400">
                      Review note
                      <input
                        name="reviewNote"
                        maxLength={1000}
                        className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-white"
                      />
                    </label>
                    <button
                      type="submit"
                      name="decision"
                      value="REFUNDED"
                      disabled={!charged}
                      title={charged ? undefined : "No credit was charged for this lead"}
                      className="rounded bg-teal-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-600 disabled:opacity-40"
                    >
                      Refund credit
                    </button>
                    <button
                      type="submit"
                      name="decision"
                      value="REJECTED"
                      className="rounded border border-neutral-600 px-3 py-1.5 text-xs font-medium hover:bg-neutral-800"
                    >
                      Reject
                    </button>
                  </form>
                ) : (
                  <p className="mt-3 text-xs text-neutral-500">
                    {flag.status === "REFUNDED" ? "Refunded" : "Rejected"}
                    {flag.reviewedAt ? ` · ${flag.reviewedAt.toLocaleString("en-IN")}` : ""}
                    {flag.reviewNote ? ` · ${flag.reviewNote}` : ""}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
