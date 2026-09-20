import Link from "next/link";
import type { LeadView } from "@/lib/leads/projection";

/**
 * One lead in the inbox list. Server-rendered; the projection has already
 * decided what this seller may see, so the card only lays it out.
 *
 * The list shows the REQUIREMENT only — never the buyer's name or number,
 * not even masked. Contact details live on the lead page, and opening it is
 * what marks the lead viewed (NEW → VIEWED), so the "new" count only drops
 * once the seller has actually looked. A teaser (free plan, market lead)
 * blurs the product and shows the upgrade path instead.
 */

const STATUS_LABEL: Record<LeadView["status"], string> = {
  NEW: "New",
  VIEWED: "Viewed",
  ACCEPTED: "Accepted",
  CLOSED: "Closed",
  EXPIRED: "Expired",
};

export function LeadCard({ lead }: { lead: LeadView }) {
  const tone =
    lead.status === "NEW"
      ? "border-teal-500"
      : lead.status === "EXPIRED"
        ? "border-neutral-200 opacity-70"
        : "border-neutral-200";

  return (
    <li className={`rounded-lg border bg-white p-5 ${tone}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge type={lead.type} />
            <span className="text-xs text-neutral-500">{STATUS_LABEL[lead.status]}</span>
            {lead.flag ? (
              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">
                Flagged · {lead.flag.status.toLowerCase()}
              </span>
            ) : null}
          </div>

          <p
            className={`mt-2 font-medium ${lead.teaser ? "text-neutral-400 blur-[2px] select-none" : ""}`}
          >
            {lead.productName}
          </p>
          <p className="mt-1 text-sm text-neutral-600">
            {lead.quantity} · {lead.city} · {lead.category}
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            {lead.timeline} · {lead.purpose}
          </p>
        </div>

        <div className="text-right text-xs text-neutral-500">
          <time dateTime={lead.createdAt.toISOString()}>{formatRelative(lead.createdAt)}</time>
          {lead.type === "MARKET" && lead.expiresAt && lead.status !== "ACCEPTED" ? (
            <p className="mt-1">
              {lead.status === "EXPIRED" ? "Expired" : `Expires ${formatRelative(lead.expiresAt)}`}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-3">
        <p className="text-sm text-neutral-500">
          {lead.teaser ? (
            <>
              Buyer details are available on a paid plan.{" "}
              <Link href="/dashboard/credits" className="text-teal-700 hover:underline">
                See plans
              </Link>
            </>
          ) : lead.type === "MARKET" && !lead.revealed ? (
            "Buyer contact — accept to reveal"
          ) : lead.status === "NEW" ? (
            "Open the lead to see the buyer's contact details"
          ) : (
            "Buyer contact on the lead page"
          )}
        </p>

        <Link
          href={`/dashboard/leads/${lead.id}`}
          className={`rounded-md px-3 py-1.5 text-xs font-medium ${
            lead.status === "NEW"
              ? "bg-neutral-900 text-white hover:bg-neutral-700"
              : "border border-neutral-300 hover:bg-neutral-50"
          }`}
        >
          {lead.acceptable ? "View & accept" : "View"}
        </Link>
      </div>
    </li>
  );
}

export function TypeBadge({ type }: { type: LeadView["type"] }) {
  return type === "DIRECT" ? (
    <span className="rounded bg-teal-50 px-1.5 py-0.5 text-xs font-medium text-teal-700">
      Direct
    </span>
  ) : (
    <span className="rounded bg-violet-50 px-1.5 py-0.5 text-xs font-medium text-violet-700">
      Market
    </span>
  );
}

/** "3h ago" / "in 2d". Coarse on purpose; the exact time is in the title. */
export function formatRelative(date: Date, now = Date.now()): string {
  const diff = date.getTime() - now;
  const abs = Math.abs(diff);
  const unit =
    abs < 3_600_000
      ? [Math.max(1, Math.round(abs / 60_000)), "m"]
      : abs < 86_400_000
        ? [Math.round(abs / 3_600_000), "h"]
        : [Math.round(abs / 86_400_000), "d"];
  return diff < 0 ? `${unit[0]}${unit[1]} ago` : `in ${unit[0]}${unit[1]}`;
}
