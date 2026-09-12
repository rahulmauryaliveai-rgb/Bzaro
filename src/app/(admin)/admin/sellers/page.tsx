import Link from "next/link";
import { requirePermission } from "@/lib/auth/guards";
import { listSellersForAdmin } from "@/server/services/admin.service";
import type { SellerStatus } from "@/generated/prisma/enums";

/** Seller directory for staff. Read access is `admin:seller:read`. */

const PER_PAGE = 25;

const STATUSES: Array<{ value: SellerStatus | undefined; label: string }> = [
  { value: undefined, label: "All" },
  { value: "PENDING_VERIFICATION", label: "Pending" },
  { value: "VERIFIED", label: "Verified" },
  { value: "DRAFT", label: "Draft" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "REJECTED", label: "Rejected" },
  { value: "BANNED", label: "Banned" },
];

type Props = {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
};

export default async function AdminSellersPage({ searchParams }: Props) {
  await requirePermission("admin:seller:read");
  const query = await searchParams;

  const status = STATUSES.some((s) => s.value === query.status)
    ? (query.status as SellerStatus | undefined)
    : undefined;

  const page = Math.max(1, Math.min(1000, Number.parseInt(query.page ?? "1", 10) || 1));
  const search = (query.q ?? "").trim().slice(0, 100) || undefined;

  const results = await listSellersForAdmin({ status, query: search, page, perPage: PER_PAGE });

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Sellers</h1>
      <p className="mt-1 text-sm text-neutral-400">
        <span className="tabular-nums">{results.total}</span> matching
      </p>

      <form action="/admin/sellers" method="get" className="mt-6 flex gap-2">
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <input
          type="search"
          name="q"
          defaultValue={search}
          placeholder="Business name, address or email…"
          maxLength={100}
          className="flex-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-neutral-900"
        >
          Search
        </button>
      </form>

      <nav className="mt-6 flex flex-wrap gap-1 border-b border-neutral-700">
        {STATUSES.map((option) => {
          const active = status === option.value;
          const href = option.value ? `/admin/sellers?status=${option.value}` : "/admin/sellers";
          return (
            <Link
              key={option.label}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                active
                  ? "border-white font-medium text-white"
                  : "border-transparent text-neutral-400 hover:text-neutral-200"
              }`}
            >
              {option.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-6 overflow-x-auto rounded-lg border border-neutral-700">
        <table className="w-full text-sm">
          <thead className="bg-neutral-800 text-left text-xs tracking-wide text-neutral-400 uppercase">
            <tr>
              <th className="px-4 py-3">Business</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Catalogue</th>
              <th className="px-4 py-3">Profile</th>
              <th className="px-4 py-3">Indexable</th>
            </tr>
          </thead>
          <tbody>
            {results.items.map((seller) => (
              <tr key={seller.id} className="border-t border-neutral-700">
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/sellers/${seller.id}`}
                    className="font-medium hover:underline"
                  >
                    {seller.businessName}
                  </Link>
                  <p className="font-mono text-xs text-neutral-500">{seller.slug}</p>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={seller.status} />
                </td>
                <td className="px-4 py-3 text-neutral-300 tabular-nums">
                  {seller.productCount}p / {seller.serviceCount}s
                </td>
                <td className="px-4 py-3 text-neutral-300 tabular-nums">{seller.profileScore}%</td>
                <td className="px-4 py-3">
                  {seller.website?.indexable ? (
                    <span className="text-teal-400">Yes</span>
                  ) : (
                    <span
                      className="text-neutral-500"
                      title={seller.website?.indexBlockReason ?? "Not evaluated"}
                    >
                      No
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {results.items.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-400">No sellers match.</p>
      ) : null}

      {results.pageCount > 1 ? (
        <nav className="mt-6 flex gap-2" aria-label="Pagination">
          {Array.from({ length: Math.min(results.pageCount, 20) }, (_, i) => i + 1).map((n) => (
            <Link
              key={n}
              href={`/admin/sellers?${status ? `status=${status}&` : ""}${search ? `q=${encodeURIComponent(search)}&` : ""}page=${n}`}
              className={`min-w-9 rounded-md border px-3 py-1.5 text-center text-sm tabular-nums ${
                n === results.page ? "border-white bg-white text-neutral-900" : "border-neutral-700"
              }`}
            >
              {n}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    VERIFIED: "bg-teal-950 text-teal-300",
    PENDING_VERIFICATION: "bg-amber-950 text-amber-300",
    SUSPENDED: "bg-red-950 text-red-300",
    BANNED: "bg-red-950 text-red-300",
    REJECTED: "bg-neutral-700 text-neutral-300",
    DRAFT: "bg-neutral-700 text-neutral-400",
  };

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? ""}`}>
      {status.replace(/_/g, " ").toLowerCase()}
    </span>
  );
}
