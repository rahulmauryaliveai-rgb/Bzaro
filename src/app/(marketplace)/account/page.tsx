import type { Metadata } from "next";
import Link from "next/link";
import { requireBuyerPage } from "@/lib/buyer/guard";
import { AccountShell } from "@/components/account/AccountShell";
import {
  RequirementProgress,
  RequirementStatusChip,
} from "@/components/account/RequirementProgress";
import { getBuyerAccountSummary, getBuyerOverview } from "@/server/services/buyer-account.service";

export const metadata: Metadata = {
  title: "My Bzaro",
  robots: { index: false, follow: false },
};

function timeAgo(date: Date): string {
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/**
 * Buyer overview — the landing page after sign-in. Answers "did anyone reply?"
 * at a glance, then gets out of the way.
 */
export default async function AccountOverviewPage() {
  const user = await requireBuyerPage("/account");
  const [summary, overview] = await Promise.all([
    getBuyerAccountSummary(user.id),
    getBuyerOverview(user.id),
  ]);
  const firstName = summary?.name?.split(" ")[0];
  const latest = overview.latest;

  return (
    <AccountShell userId={user.id} active="overview">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {firstName ? `Namaste, ${firstName}` : "Welcome to Bzaro"}
          </h1>
          <p className="mt-1 text-sm text-neutral-600">
            Here&apos;s what&apos;s happening with your sourcing.
          </p>
        </div>
        <Link
          href="/post-requirement"
          className="bg-accent-600 hover:bg-accent-700 inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold text-white"
        >
          + Post a requirement
        </Link>
      </div>

      <dl className="mt-6 grid grid-cols-3 gap-3">
        {[
          {
            label: "Active requirements",
            value: summary?.counts.activeRequirements ?? 0,
            href: "/account/requirements",
          },
          {
            label: "Supplier responses",
            value: overview.responses,
            href: "/account/requirements",
            accent: true,
          },
          { label: "Saved suppliers", value: summary?.counts.saved ?? 0, href: "/account/saved" },
        ].map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="hover:border-brand-300 rounded-lg border border-neutral-200 p-3 transition-colors sm:p-4"
          >
            <dd
              className={`text-2xl font-bold sm:text-3xl ${stat.accent ? "text-accent-700" : "text-neutral-900"}`}
            >
              {stat.value}
            </dd>
            <dt className="mt-0.5 text-xs text-neutral-600 sm:text-sm">{stat.label}</dt>
          </Link>
        ))}
      </dl>

      <h2 className="mt-8 mb-3 text-base font-semibold">Latest requirement</h2>
      {latest ? (
        <div className="rounded-lg border border-neutral-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-neutral-900">{latest.productName}</p>
              <p className="mt-0.5 text-sm text-neutral-600">
                {latest.quantity} {latest.quantityUnit} · {latest.location.name} ·{" "}
                {latest.category.name} · posted{" "}
                {latest.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              </p>
            </div>
            <RequirementStatusChip progress={latest.progress} closed={latest.closedAt !== null} />
          </div>
          <div className="mt-4">
            <RequirementProgress progress={latest.progress} />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-neutral-600">
              {latest.progress.responded > 0
                ? "Suppliers are ready to talk — open it to contact them."
                : latest.progress.sent > 0
                  ? "Matched suppliers have it. You'll see them here as they respond."
                  : "We're matching your requirement with suppliers."}
            </p>
            <Link
              href={`/account/requirements/${latest.id}`}
              className="bg-brand-700 hover:bg-brand-800 inline-flex min-h-10 items-center rounded-lg px-4 text-sm font-semibold text-white"
            >
              View details →
            </Link>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center">
          <p className="text-sm text-neutral-600">
            You haven&apos;t posted a requirement yet. Tell us what you need and verified suppliers
            will contact you.
          </p>
          <Link
            href="/post-requirement"
            className="text-brand-700 mt-3 inline-block text-sm font-semibold hover:underline"
          >
            Post your first requirement →
          </Link>
        </div>
      )}

      {overview.activity.length > 0 ? (
        <>
          <h2 className="mt-8 mb-3 text-base font-semibold">Recent activity</h2>
          <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
            {overview.activity.map((item, index) => (
              <li key={index}>
                <Link
                  href={`/account/requirements/${item.requirementId}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-neutral-50"
                >
                  <span>
                    <span
                      aria-hidden="true"
                      className={`mr-2 inline-block h-2 w-2 rounded-full ${item.kind === "responded" ? "bg-accent-600" : "bg-amber-400"}`}
                    />
                    <span className="font-medium">{item.sellerName}</span>{" "}
                    {item.kind === "responded" ? "responded to" : "viewed"} &ldquo;
                    {item.productName}&rdquo;
                  </span>
                  <span className="text-xs text-neutral-500">{timeAgo(item.at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </AccountShell>
  );
}
