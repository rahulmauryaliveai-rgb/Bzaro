import type { Metadata } from "next";
import Link from "next/link";
import { requireSeller } from "@/lib/auth/guards";
import { getCreditSummary, listPlansForSeller } from "@/server/services/lead-inbox.service";
import { formatPrice } from "@/lib/utils/money";

export const metadata: Metadata = {
  title: "Lead credits",
  robots: { index: false, follow: false },
};

/**
 * Credits: balance, what the plan grants, the ledger, and the plan ladder.
 *
 * The ledger is shown in full rather than summarised — a seller disputing a
 * charge needs to see the exact lead it was for, and the refund next to it.
 * Plan changes themselves go through billing (Phase 9 / D6); this page only
 * explains what each plan includes.
 */

const REASON_LABEL = {
  MONTHLY_GRANT: "Monthly credits",
  LEAD_ACCEPT: "Lead accepted",
  FLAG_REFUND: "Refund",
  ADMIN_ADJUST: "Adjustment",
} as const;

export default async function CreditsPage() {
  const scope = await requireSeller();
  const [{ entitlement, entries }, plans] = await Promise.all([
    getCreditSummary(scope.sellerId),
    listPlansForSeller(),
  ]);

  return (
    <div className="max-w-3xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Lead credits</h1>
        <p className="mt-1 text-sm text-neutral-600">
          One credit unlocks one market lead. Direct enquiries are always free.
        </p>
      </header>

      <dl className="grid gap-4 sm:grid-cols-3">
        <Stat label="Available now" value={String(entitlement.creditBalance)} />
        <Stat label="Granted monthly" value={String(entitlement.monthlyCredits)} />
        <Stat label="Plan" value={entitlement.planName} />
      </dl>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-neutral-500 uppercase">
          Plans
        </h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {plans.map((plan) => {
            const current = plan.name === entitlement.planName;
            return (
              <li
                key={plan.id}
                className={`rounded-lg border bg-white p-4 ${
                  current ? "border-neutral-900" : "border-neutral-200"
                }`}
              >
                <p className="font-medium">
                  {plan.name}
                  {current ? (
                    <span className="ml-2 text-xs font-normal text-neutral-500">current</span>
                  ) : null}
                </p>
                <p className="mt-1 text-sm text-neutral-600">
                  {plan.priceMinor === 0
                    ? "Free"
                    : `${formatPrice({ minor: plan.priceMinor, currency: plan.currency, onRequest: false })} / month`}
                </p>
                <p className="mt-2 text-sm">
                  <span className="font-medium tabular-nums">{plan.leadCreditsPerMonth ?? 0}</span>{" "}
                  market lead credits / month
                </p>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-neutral-500">
          To change plan, contact support — self-service billing is coming.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-neutral-500 uppercase">
          History
        </h2>
        {entries.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-600">
            No credit activity yet.
          </p>
        ) : (
          <table className="w-full rounded-lg border border-neutral-200 bg-white text-sm">
            <thead className="text-left text-xs text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">What</th>
                <th className="px-4 py-2 text-right font-medium">Change</th>
                <th className="px-4 py-2 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2 text-neutral-600">
                    <time dateTime={entry.createdAt.toISOString()}>
                      {entry.createdAt.toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </time>
                  </td>
                  <td className="px-4 py-2">
                    {REASON_LABEL[entry.reason]}
                    {entry.periodKey ? (
                      <span className="text-neutral-500"> · {entry.periodKey}</span>
                    ) : null}
                    {entry.lead ? (
                      <>
                        {" · "}
                        <Link
                          href={`/dashboard/leads/${entry.lead.id}`}
                          className="hover:underline"
                        >
                          {entry.lead.requirement.productName}
                        </Link>
                      </>
                    ) : null}
                    {entry.note ? <span className="text-neutral-500"> · {entry.note}</span> : null}
                  </td>
                  <td
                    className={`px-4 py-2 text-right tabular-nums ${
                      entry.delta > 0 ? "text-teal-700" : "text-neutral-900"
                    }`}
                  >
                    {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{entry.balanceAfter}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
