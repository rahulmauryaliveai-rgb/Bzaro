import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSeller } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { getSellerLead, markLeadViewed } from "@/server/services/lead-inbox.service";
import { TypeBadge, formatRelative } from "@/components/dashboard/LeadCard";
import { AcceptLead, CloseLead, FlagLead, LeadOutcome } from "@/components/dashboard/LeadActions";

export const metadata: Metadata = {
  title: "Lead",
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ id: string }> };

/**
 * One lead. Opening it moves NEW → VIEWED — that is what "viewed" means, and
 * the write is idempotent, so a refresh changes nothing.
 */
export default async function LeadDetailPage({ params }: Props) {
  const scope = await requireSeller();
  const { id } = await params;

  await markLeadViewed(scope.sellerId, id);
  const result = await getSellerLead(scope.sellerId, id);
  if (!result) notFound();

  const { lead, entitlement } = result;
  const canAccept = can(scope.role, "lead:accept");
  const canManage = can(scope.role, "lead:manage");
  const open = lead.status === "NEW" || lead.status === "VIEWED" || lead.status === "ACCEPTED";

  return (
    <div className="max-w-2xl">
      <Link href="/dashboard/leads" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← All leads
      </Link>

      <header className="mt-4">
        <div className="flex flex-wrap items-center gap-2">
          <TypeBadge type={lead.type} />
          <span className="text-xs text-neutral-500">
            {lead.status.charAt(0) + lead.status.slice(1).toLowerCase()} ·{" "}
            <time dateTime={lead.createdAt.toISOString()}>{formatRelative(lead.createdAt)}</time>
          </span>
        </div>
        <h1
          className={`mt-2 text-2xl font-semibold tracking-tight ${
            lead.teaser ? "text-neutral-400 blur-[3px] select-none" : ""
          }`}
        >
          {lead.productName}
        </h1>
      </header>

      <dl className="mt-6 grid gap-x-8 gap-y-3 rounded-lg border border-neutral-200 bg-white p-5 text-sm sm:grid-cols-2">
        <Row label="Quantity">{lead.quantity}</Row>
        <Row label="City">{lead.city}</Row>
        <Row label="Category">{lead.category}</Row>
        <Row label="Needed">{lead.timeline}</Row>
        <Row label="Purpose">{lead.purpose}</Row>
        {lead.type === "MARKET" && lead.expiresAt && lead.status !== "ACCEPTED" ? (
          <Row label={lead.status === "EXPIRED" ? "Expired" : "Expires"}>
            {formatRelative(lead.expiresAt)}
          </Row>
        ) : null}
        {lead.notes ? (
          <div className="sm:col-span-2">
            <dt className="text-neutral-500">Notes from the buyer</dt>
            <dd className="mt-0.5 whitespace-pre-line">{lead.notes}</dd>
          </div>
        ) : null}
      </dl>

      <section className="mt-6 rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold tracking-wide text-neutral-500 uppercase">Buyer</h2>

        {lead.revealed ? (
          <div className="mt-3 text-sm">
            <p className="font-medium">{lead.buyer.name ?? "Name not given"}</p>
            {lead.buyer.company ? <p className="text-neutral-600">{lead.buyer.company}</p> : null}
            <p className="mt-2">
              <a
                href={`tel:${lead.buyer.phone.replace(/\s/g, "")}`}
                className="text-teal-700 hover:underline"
              >
                {lead.buyer.phone}
              </a>
              {" · "}
              <a
                href={`https://wa.me/${lead.buyer.phone.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-teal-700 hover:underline"
              >
                WhatsApp
              </a>
            </p>
          </div>
        ) : lead.teaser ? (
          <div className="mt-3 text-sm text-neutral-600">
            <p>
              A buyer in <span className="font-medium">{lead.city}</span> is looking for{" "}
              <span className="font-medium">{lead.category.toLowerCase()}</span>. Their contact
              details are available on a paid plan, which includes monthly lead credits.
            </p>
            <Link
              href="/dashboard/credits"
              className="mt-3 inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              See plans
            </Link>
          </div>
        ) : (
          <div className="mt-3 space-y-3 text-sm">
            <p className="text-neutral-600">
              <span className="font-mono">{lead.buyer.phone}</span> — accept this lead to see the
              full number and the buyer&apos;s name.
            </p>
            {canAccept && lead.acceptable ? (
              <AcceptLead lead={lead} creditBalance={entitlement.creditBalance} />
            ) : lead.acceptBlockedBy === "no_credits" ? (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-800">
                You have no credits left this month.{" "}
                <Link href="/dashboard/credits" className="underline underline-offset-2">
                  Manage credits
                </Link>
              </p>
            ) : lead.acceptBlockedBy === "expired" ? (
              <p className="text-neutral-500">This lead has expired.</p>
            ) : null}
          </div>
        )}
      </section>

      {canManage && open ? (
        <section className="mt-6 space-y-4 rounded-lg border border-neutral-200 bg-white p-5">
          {lead.sellerNote ? (
            <p className="text-sm text-neutral-600">Your note: {lead.sellerNote}</p>
          ) : null}
          {/* Only once the buyer's details are actually visible. */}
          {["VIEWED", "ACCEPTED", "CONTACTED", "WON", "LOST"].includes(lead.status) ? (
            <div>
              <p className="mb-2 text-xs font-medium text-neutral-600">How did it go?</p>
              <LeadOutcome leadId={lead.id} status={lead.status} />
            </div>
          ) : null}
          {lead.status !== "CLOSED" ? <CloseLead leadId={lead.id} /> : null}
          {!lead.flag && lead.status !== "NEW" ? (
            <FlagLead
              leadId={lead.id}
              refundable={lead.type === "MARKET" && lead.status === "ACCEPTED"}
            />
          ) : null}
          {lead.flag ? (
            <p className="text-xs text-neutral-500">
              Flagged ({lead.flag.reason.toLowerCase().replace(/_/g, " ")}) ·{" "}
              {lead.flag.status === "OPEN"
                ? "under review"
                : lead.flag.status === "REFUNDED"
                  ? "credit refunded"
                  : "reviewed, no refund"}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-neutral-500">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
