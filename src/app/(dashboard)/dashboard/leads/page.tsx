import type { Metadata } from "next";
import Link from "next/link";
import { requireSeller } from "@/lib/auth/guards";
import { leadListParamsSchema } from "@/lib/validation/lead";
import { getLeadAllowance, listSellerLeads } from "@/server/services/lead-inbox.service";
import { billingGatewayReady, getBillingSettings } from "@/server/services/billing.service";
import { LeadCard } from "@/components/dashboard/LeadCard";
import { AddonBuyButton } from "@/components/billing/BillingCheckout";
import { withGst } from "@/lib/billing/gst";
import { formatMoney } from "@/lib/utils/money";

export const metadata: Metadata = {
  title: "Leads",
  robots: { index: false, follow: false },
};

/**
 * Seller lead inbox (docs/LEADS.md).
 *
 * Two kinds of lead side by side. DIRECT: a buyer chose this seller and their
 * number is shown at once. MARKET: the platform matched this seller to a
 * buyer's requirement; the number appears after accepting, which costs a
 * credit. Every row has already been through `projectLead`, so nothing here
 * decides what to hide.
 */

const PER_PAGE = 20;

const TYPE_TABS = [
  { value: undefined, label: "All" },
  { value: "DIRECT", label: "Direct" },
  { value: "MARKET", label: "Market" },
] as const;

const STATUS_FILTERS = [
  { value: undefined, label: "Any status" },
  { value: "NEW", label: "New" },
  { value: "VIEWED", label: "Viewed" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "CLOSED", label: "Closed" },
  { value: "EXPIRED", label: "Expired" },
] as const;

type Props = { searchParams: Promise<{ type?: string; status?: string; page?: string }> };

export default async function LeadsPage({ searchParams }: Props) {
  const scope = await requireSeller();
  const query = leadListParamsSchema.safeParse(await searchParams);
  const filters = query.success ? query.data : { page: 1 as const };

  const [results, allowance, billing] = await Promise.all([
    listSellerLeads(scope.sellerId, {
      type: filters.type,
      status: filters.status,
      page: filters.page,
      perPage: PER_PAGE,
    }),
    getLeadAllowance(scope.sellerId),
    getBillingSettings(),
  ]);
  const online = billingGatewayReady();
  const pack = withGst(billing.leadPackPriceMinor, billing.gstRatePercent);
  const packLabel = `Buy ${billing.leadPackCredits} leads · ${formatMoney(billing.leadPackPriceMinor, "INR")} + GST`;

  const href = (next: { type?: string; status?: string; page?: number }) => {
    const params = new URLSearchParams();
    const type = "type" in next ? next.type : filters.type;
    const status = "status" in next ? next.status : filters.status;
    if (type) params.set("type", type);
    if (status) params.set("status", status);
    if (next.page && next.page > 1) params.set("page", String(next.page));
    const qs = params.toString();
    return qs ? `/dashboard/leads?${qs}` : "/dashboard/leads";
  };

  const { entitlement } = results;

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="mt-1 text-sm text-neutral-600">
            {results.unread > 0 ? (
              <>
                <span className="font-medium text-neutral-900 tabular-nums">{results.unread}</span>{" "}
                new
              </>
            ) : (
              "Nothing new right now."
            )}
          </p>
        </div>
        <Link
          href="/dashboard/credits"
          className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm hover:bg-neutral-50"
        >
          <span className="font-medium tabular-nums">{entitlement.creditBalance}</span> credits ·{" "}
          {entitlement.planName}
        </Link>
      </header>

      {allowance.weekly ? (
        <p className="mb-4 text-sm text-neutral-600">
          <span className="font-medium text-neutral-900 tabular-nums">
            {allowance.weekly.used} of {allowance.weekly.quota}
          </span>{" "}
          matched leads this week
          {allowance.dailyQuota > 0
            ? allowance.weekly.exhausted
              ? allowance.dailyLeft > 0
                ? " · your lead of the day is still to come"
                : " · lead of the day received — more tomorrow"
              : ` + ${allowance.dailyQuota} lead of the day once these are used`
            : ""}
          . Weekly leads expire on Sunday night; the lead of the day expires the next day.
        </p>
      ) : null}

      {allowance.showJoinPro ? (
        <div className="border-brand-200 bg-brand-50 mb-6 rounded-xl border p-5 text-sm">
          <p className="text-base font-semibold text-neutral-900">
            Buyers are asking for what you sell.
          </p>
          <p className="mt-1 text-neutral-700">
            On the Free plan you are notified of matched requirements but can&apos;t see who the
            buyer is. Join Bzaro Pro to get fresh leads every week plus a lead every day — with 30
            credits a month to unlock them — or buy a pack of {billing.leadPackCredits} leads now.
          </p>
          <div className="mt-4 flex flex-wrap items-start gap-3">
            <Link
              href="/dashboard/billing"
              className="bg-brand-700 hover:bg-brand-600 inline-flex items-center rounded-lg px-4 py-2.5 text-sm font-semibold text-white"
            >
              Join Bzaro Pro
            </Link>
            {online ? (
              <div className="min-w-56">
                <AddonBuyButton kind="LEAD_PACK" label={packLabel} />
              </div>
            ) : (
              <Link
                href="/dashboard/billing"
                className="border-brand-200 text-brand-800 inline-flex rounded-lg border bg-white px-4 py-2.5 text-sm font-medium"
              >
                {packLabel}
              </Link>
            )}
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            Lead pack total {formatMoney(pack.totalMinor, "INR")} incl. GST. Credits never expire.
          </p>
        </div>
      ) : allowance.showLeadPack ? (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-semibold">You have used all your lead credits.</p>
          <p className="mt-1">
            Top up with {billing.leadPackCredits} more credits to keep unlocking buyers this month.
          </p>
          <div className="mt-3 max-w-xs">
            {online ? (
              <AddonBuyButton kind="LEAD_PACK" label={packLabel} variant="accent" />
            ) : (
              <Link href="/dashboard/billing" className="underline underline-offset-2">
                {packLabel}
              </Link>
            )}
          </div>
        </div>
      ) : null}

      <nav className="mb-4 flex flex-wrap gap-1 border-b border-neutral-200">
        {TYPE_TABS.map((tab) => {
          const active = filters.type === tab.value;
          return (
            <Link
              key={tab.label}
              href={href({ type: tab.value, page: 1 })}
              aria-current={active ? "page" : undefined}
              className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                active
                  ? "border-neutral-900 font-medium text-neutral-900"
                  : "border-transparent text-neutral-500 hover:text-neutral-800"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <div className="mb-6 flex flex-wrap gap-2 text-xs">
        {STATUS_FILTERS.map((filter) => {
          const active = filters.status === filter.value;
          return (
            <Link
              key={filter.label}
              href={href({ status: filter.value, page: 1 })}
              className={`rounded-full border px-2.5 py-1 ${
                active
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              {filter.label}
            </Link>
          );
        })}
      </div>

      {results.items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-12 text-center">
          <p className="font-medium">No leads here yet</p>
          <p className="mt-1 text-sm text-neutral-600">
            Direct leads arrive when a buyer contacts you from your product pages. Market leads
            arrive when a buyer posts a requirement in your category.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {results.items.map((lead) => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
        </ul>
      )}

      {results.pages > 1 ? (
        <nav className="mt-6 flex items-center justify-between text-sm">
          {results.page > 1 ? (
            <Link href={href({ page: results.page - 1 })} className="hover:underline">
              ← Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="text-neutral-500">
            Page {results.page} of {results.pages}
          </span>
          {results.page < results.pages ? (
            <Link href={href({ page: results.page + 1 })} className="hover:underline">
              Older →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
