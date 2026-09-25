import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBuyerPage } from "@/lib/buyer/guard";
import { AccountShell } from "@/components/account/AccountShell";
import {
  RequirementProgress,
  RequirementStatusChip,
} from "@/components/account/RequirementProgress";
import { CloseRequirementButton } from "@/components/account/CloseRequirementButton";
import { getBuyerRequirement } from "@/server/services/buyer-account.service";
import { PURPOSE_LABELS, TIMELINE_LABELS } from "@/lib/validation/requirement";

export const metadata: Metadata = {
  title: "Requirement details",
  robots: { index: false, follow: false },
};

const TRIGGER_LABELS: Record<string, string> = {
  CALL: "Call button",
  WHATSAPP: "Enquire on WhatsApp",
  ENQUIRY: "Get Best Price",
  SEARCH_CARD: "Post requirement",
};

function shortDate(date: Date | null): string | undefined {
  return date?.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function whatsappHref(number: string, productName: string): string {
  const digits = number.replace(/\D/g, "");
  const text = encodeURIComponent(
    `Hi, I'm following up on my requirement for ${productName} on Bzaro.`,
  );
  return `https://wa.me/${digits}?text=${text}`;
}

type Props = { params: Promise<{ id: string }> };

/**
 * One requirement: full details, progress, and the suppliers who engaged.
 * Contact details appear only for suppliers who accepted (or the one the buyer
 * contacted directly). Everyone else is a count — see buyer-account.service.
 */
export default async function RequirementDetailPage({ params }: Props) {
  const { id } = await params;
  const user = await requireBuyerPage(`/account/requirements/${id}`);
  const requirement = await getBuyerRequirement(user.id, id);
  if (!requirement) notFound();

  const closed = requirement.closedAt !== null;
  const { progress, milestones } = requirement;

  const details: Array<[string, string | null | undefined]> = [
    ["Product", requirement.productName],
    ["Quantity", `${requirement.quantity} ${requirement.quantityUnit}`],
    ["Category", requirement.category.name],
    ["City", requirement.location.name],
    ["Needed", TIMELINE_LABELS[requirement.timeline]],
    ["Purpose", PURPOSE_LABELS[requirement.purpose]],
    ["Business", requirement.businessName],
    ["GSTIN", requirement.gstin],
    ["Notes", requirement.notes],
    [
      "Sent via",
      requirement.directSellerName
        ? `${TRIGGER_LABELS[requirement.trigger] ?? "Enquiry"} on ${requirement.directSellerName}`
        : TRIGGER_LABELS[requirement.trigger],
    ],
  ];

  return (
    <AccountShell userId={user.id} active="requirements">
      <Link
        href="/account/requirements"
        className="text-sm text-neutral-500 hover:text-neutral-900"
      >
        ← My requirements
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{requirement.productName}</h1>
            <RequirementStatusChip progress={progress} closed={closed} />
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            Posted{" "}
            {requirement.createdAt.toLocaleDateString("en-IN", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            {closed ? ` · closed ${shortDate(requirement.closedAt)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/post-requirement?repost=${requirement.id}`}
            className="inline-flex min-h-10 items-center rounded-lg border border-neutral-300 px-3 text-sm font-medium hover:bg-neutral-50"
          >
            Re-post
          </Link>
          {!closed ? <CloseRequirementButton requirementId={requirement.id} /> : null}
        </div>
      </div>

      <div className="mt-6 rounded-lg bg-neutral-50 px-4 py-3">
        <RequirementProgress
          progress={progress}
          closed={closed}
          labels={{
            sent: progress.sent > 0 ? `Sent to ${progress.sent}` : "Matching suppliers",
            viewed: milestones.viewedAt ? `Viewed · ${shortDate(milestones.viewedAt)}` : "Viewed",
            responded: milestones.respondedAt
              ? `${progress.responded} responded · ${shortDate(milestones.respondedAt)}`
              : "Responded",
            closed: closed ? `Closed · ${shortDate(requirement.closedAt)}` : "Closed",
          }}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <section aria-labelledby="suppliers-heading">
          <h2 id="suppliers-heading" className="mb-3 text-base font-semibold">
            Suppliers
          </h2>
          <div className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
            {requirement.suppliers.length === 0 ? (
              <p className="px-4 py-6 text-sm text-neutral-600">
                {progress.sent > 0
                  ? "Matched suppliers have your requirement. They'll appear here as they view and respond."
                  : "We're matching your requirement with suppliers in your category and city."}
              </p>
            ) : (
              requirement.suppliers.map((supplier) => (
                <div
                  key={supplier.leadId}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm">
                      <Link
                        href={`/seller/${supplier.sellerSlug}`}
                        className="font-semibold hover:underline"
                      >
                        {supplier.sellerName}
                      </Link>
                      {supplier.verified ? (
                        <span className="text-accent-700 ml-2 text-xs font-semibold">
                          ✓ Verified
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {supplier.city ? `${supplier.city} · ` : ""}
                      {supplier.state === "responded"
                        ? `Responded ${shortDate(supplier.at)}`
                        : `Viewed ${shortDate(supplier.at)} · waiting for their reply`}
                    </p>
                  </div>
                  {supplier.whatsapp || supplier.phone ? (
                    <div className="flex gap-2">
                      {supplier.whatsapp ? (
                        <a
                          href={whatsappHref(supplier.whatsapp, requirement.productName)}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="inline-flex min-h-10 items-center rounded-lg bg-[#25D366] px-3 text-sm font-semibold text-white hover:bg-[#1eb855]"
                        >
                          WhatsApp
                        </a>
                      ) : null}
                      {supplier.phone ? (
                        <a
                          href={`tel:${supplier.phone}`}
                          className="inline-flex min-h-10 items-center rounded-lg border border-neutral-300 px-3 text-sm font-semibold hover:bg-neutral-50"
                        >
                          Call
                        </a>
                      ) : null}
                    </div>
                  ) : (
                    <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                      Viewed
                    </span>
                  )}
                </div>
              ))
            )}
            {requirement.hiddenCount > 0 ? (
              <p className="px-4 py-3 text-xs text-neutral-500">
                + sent to {requirement.hiddenCount} more matched supplier
                {requirement.hiddenCount === 1 ? "" : "s"} in your category and city
              </p>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            Contact details appear once a supplier accepts your requirement.
          </p>
        </section>

        <section aria-labelledby="details-heading">
          <h2 id="details-heading" className="mb-3 text-base font-semibold">
            Your requirement
          </h2>
          <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 rounded-lg border border-neutral-200 p-4 text-sm">
            {details
              .filter((row): row is [string, string] => Boolean(row[1]))
              .map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-neutral-500">{label}</dt>
                  <dd className="break-words text-neutral-900">{value}</dd>
                </div>
              ))}
          </dl>
        </section>
      </div>
    </AccountShell>
  );
}
