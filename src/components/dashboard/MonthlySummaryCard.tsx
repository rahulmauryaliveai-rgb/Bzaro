import Link from "next/link";
import { formatMoney } from "@/lib/utils/money";
import type { MonthlySummary } from "@/server/services/seller-summary.service";

/**
 * "What did Bzaro do for me this month" (Phase 7).
 *
 * The `fromBzaro` figure is the one that matters at renewal: it separates leads
 * the marketplace introduced from ones the seller's own storefront would have
 * got anyway.
 */
export function MonthlySummaryCard({ summary }: { summary: MonthlySummary }) {
  const stats = [
    { label: "Leads", value: String(summary.leads), href: "/dashboard/leads" },
    { label: "From Bzaro", value: String(summary.fromBzaro), href: "/dashboard/leads" },
    { label: "Orders", value: String(summary.orders), href: "/dashboard/orders" },
    {
      label: "Paid",
      value: formatMoney(summary.wonValueMinor, summary.currency),
      href: "/dashboard/orders",
    },
  ];

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">This month</h2>
        <span className="text-xs text-neutral-500">{summary.monthLabel}</span>
      </div>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label}>
            <dt className="text-xs text-neutral-500">{stat.label}</dt>
            <dd className="mt-0.5 text-xl font-semibold tabular-nums">
              <Link href={stat.href} className="hover:underline">
                {stat.value}
              </Link>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
