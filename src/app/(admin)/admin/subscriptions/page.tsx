import Link from "next/link";
import { requirePermission } from "@/lib/auth/guards";
import {
  listSubscriptionsForAdmin,
  listUpgradeRequests,
} from "@/server/services/admin-billing.service";
import type { SubStatus } from "@/generated/prisma/enums";

/**
 * Subscriptions: every seller's plan and period, plus the queue of sellers
 * who asked to upgrade (D32 — no gateway yet, so the admin is the gateway).
 * Plan changes happen on the seller's page, where the reviewer also sees
 * verification state and credits.
 */

const STATUSES: SubStatus[] = ["ACTIVE", "TRIALING", "PAST_DUE", "CANCELED", "EXPIRED"];

type Props = {
  searchParams: Promise<{ plan?: string; status?: string; q?: string; page?: string }>;
};

export default async function AdminSubscriptionsPage({ searchParams }: Props) {
  await requirePermission("admin:subscription:manage");
  const query = await searchParams;
  const status = STATUSES.includes(query.status as SubStatus)
    ? (query.status as SubStatus)
    : undefined;

  const [results, requests] = await Promise.all([
    listSubscriptionsForAdmin({
      plan: query.plan || undefined,
      status,
      q: query.q?.trim() || undefined,
      page: Number.parseInt(query.page ?? "1", 10) || 1,
    }),
    listUpgradeRequests(20),
  ]);
  const openRequests = requests.filter((request) => request.open);

  return (
    <div className="max-w-6xl">
      <h1 className="text-2xl font-semibold tracking-tight">Subscriptions</h1>
      <p className="mt-1 text-sm text-neutral-400">
        {results.total} sellers. Change a seller&rsquo;s plan from their page — the website tier
        follows the plan immediately (D32).
      </p>

      {openRequests.length > 0 ? (
        <section className="mt-6 rounded-lg border border-amber-800 bg-amber-950/30 p-5">
          <h2 className="text-sm font-semibold tracking-wide text-amber-200 uppercase">
            Upgrade requests · {openRequests.length} open
          </h2>
          <ul className="mt-3 divide-y divide-amber-900/50 text-sm">
            {openRequests.map((request) => (
              <li key={request.id} className="flex flex-wrap items-center gap-3 py-2">
                <Link
                  href={`/admin/sellers/${request.seller.id}`}
                  className="font-medium hover:underline"
                >
                  {request.seller.businessName}
                </Link>
                <span className="text-neutral-400">
                  {request.current} → <span className="text-amber-200">{request.wanted}</span>
                </span>
                <span className="ml-auto text-xs text-neutral-500">
                  {request.createdAt.toLocaleString("en-IN")}
                </span>
                <Link
                  href={`/admin/sellers/${request.seller.id}`}
                  className="rounded-md bg-white px-3 py-1 text-xs font-medium text-neutral-900 hover:bg-neutral-200"
                >
                  Review & activate
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <form method="get" className="mt-6 flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-neutral-500">Search</span>
          <input
            name="q"
            defaultValue={query.q ?? ""}
            placeholder="Business or slug"
            className={input}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-neutral-500">Plan</span>
          <select name="plan" defaultValue={query.plan ?? ""} className={input}>
            <option value="">All plans</option>
            {results.plans.map((plan) => (
              <option key={plan.key} value={plan.key}>
                {plan.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-neutral-500">Status</span>
          <select name="status" defaultValue={status ?? ""} className={input}>
            <option value="">Any</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={secondary}>
          Filter
        </button>
      </form>

      <div className="mt-4 overflow-hidden rounded-lg border border-neutral-700">
        <table className="w-full text-sm">
          <thead className="bg-neutral-800 text-left text-xs tracking-wide text-neutral-400 uppercase">
            <tr>
              <th className="px-4 py-3">Seller</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Period ends</th>
              <th className="px-4 py-3">Web presence</th>
              <th className="px-4 py-3">Credits</th>
            </tr>
          </thead>
          <tbody>
            {results.items.map((row) => (
              <tr key={row.id} className="border-t border-neutral-700">
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/sellers/${row.seller.id}`}
                    className="font-medium hover:underline"
                  >
                    {row.seller.businessName}
                  </Link>
                  <p className="font-mono text-xs text-neutral-500">{row.seller.slug}</p>
                </td>
                <td className="px-4 py-3">{row.plan.name}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      row.status === "ACTIVE" || row.status === "TRIALING"
                        ? "bg-emerald-900/50 text-emerald-200"
                        : row.status === "PAST_DUE"
                          ? "bg-amber-900/50 text-amber-200"
                          : "bg-neutral-700 text-neutral-300"
                    }`}
                  >
                    {row.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-neutral-300 tabular-nums">
                  {row.currentPeriodEnd.toLocaleDateString("en-IN")}
                  {row.gracePeriodEndsAt ? (
                    <span className="block text-xs text-amber-300">
                      grace to {row.gracePeriodEndsAt.toLocaleDateString("en-IN")}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-neutral-300">
                  {row.seller.webPresence}
                  {row.seller.webPresence !== row.plan.webPresence ? (
                    <span className="block text-amber-300">plan says {row.plan.webPresence}</span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-neutral-300 tabular-nums">
                  {row.seller.creditBalance}
                </td>
              </tr>
            ))}
            {results.items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">
                  No subscriptions match.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {results.pageCount > 1 ? (
        <nav className="mt-4 flex gap-2 text-sm">
          {Array.from({ length: results.pageCount }, (_, index) => index + 1).map((page) => (
            <Link
              key={page}
              href={`/admin/subscriptions?${new URLSearchParams({ ...query, page: String(page) })}`}
              className={`rounded-md px-3 py-1 ${page === results.page ? "bg-white text-neutral-900" : "border border-neutral-700"}`}
            >
              {page}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}

const input = "rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-neutral-100";
const secondary = "rounded-md border border-neutral-600 px-3 py-1.5 hover:bg-neutral-700";
