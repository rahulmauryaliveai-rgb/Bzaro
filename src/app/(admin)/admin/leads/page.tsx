import Link from "next/link";
import { requirePermission } from "@/lib/auth/guards";
import { listRequirementsForAdmin } from "@/server/services/admin-leads.service";
import { formatPhone } from "@/lib/buyer/phone";

/**
 * Every requirement, with its fan-out state and the leads it produced.
 *
 * This is the page to open when a seller says "I never got that lead": the
 * fan-out status says whether the worker ran, `fanoutError` says why it
 * skipped, and the lead list says who was matched.
 */
export default async function AdminLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requirePermission("admin:lead:read");

  const query = await searchParams;
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const data = await listRequirementsForAdmin(page);

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
      <p className="mt-1 text-sm text-neutral-400">
        <span className="tabular-nums">{data.total}</span> requirement{data.total === 1 ? "" : "s"}
        {" · "}
        {Object.entries(data.byStatus)
          .map(([status, count]) => `${count} ${status.toLowerCase()}`)
          .join(" · ")}
      </p>

      <ul className="mt-6 space-y-3">
        {data.items.map((r) => (
          <li
            key={r.id}
            className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">
                  {r.productName}{" "}
                  <span className="font-normal text-neutral-400">
                    · {r.quantity} {r.quantityUnit} · {r.location.name} · {r.category.name}
                  </span>
                </p>
                <p className="mt-1 text-neutral-400">
                  Buyer {r.buyer.phone ? formatPhone(r.buyer.phone) : "—"}
                  {r.buyer.name ? ` (${r.buyer.name})` : ""} ·{" "}
                  <time dateTime={r.createdAt.toISOString()}>
                    {r.createdAt.toLocaleString("en-IN")}
                  </time>
                </p>
              </div>
              <FanoutBadge status={r.fanoutStatus} error={r.fanoutError} />
            </div>

            {r.leads.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-2 text-xs">
                {r.leads.map((lead, index) => (
                  <li
                    key={`${r.id}-${index}`}
                    className={`rounded border px-2 py-1 ${
                      lead.type === "DIRECT"
                        ? "border-teal-800 text-teal-300"
                        : "border-violet-800 text-violet-300"
                    }`}
                  >
                    <Link href={`/admin/sellers?q=${lead.seller.slug}`} className="hover:underline">
                      {lead.seller.slug}
                    </Link>{" "}
                    <span className="text-neutral-500">{lead.status.toLowerCase()}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-neutral-500">No leads yet.</p>
            )}
          </li>
        ))}
      </ul>

      {data.pages > 1 ? (
        <nav className="mt-6 flex justify-between text-sm">
          {page > 1 ? (
            <Link href={`/admin/leads?page=${page - 1}`} className="hover:underline">
              ← Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="text-neutral-500">
            Page {page} of {data.pages}
          </span>
          {page < data.pages ? (
            <Link href={`/admin/leads?page=${page + 1}`} className="hover:underline">
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

function FanoutBadge({ status, error }: { status: string; error: string | null }) {
  const tone =
    status === "DONE"
      ? "bg-teal-900/40 text-teal-300"
      : status === "PENDING" || status === "RUNNING"
        ? "bg-neutral-800 text-neutral-300"
        : status === "SKIPPED"
          ? "bg-amber-900/40 text-amber-300"
          : "bg-red-900/40 text-red-300";
  return (
    <span className={`rounded px-2 py-0.5 text-xs ${tone}`} title={error ?? undefined}>
      fan-out {status.toLowerCase()}
      {error ? ` · ${error}` : ""}
    </span>
  );
}
