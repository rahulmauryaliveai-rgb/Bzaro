import type { Metadata } from "next";
import Link from "next/link";
import { requireBuyerPage } from "@/lib/buyer/guard";
import { AccountShell } from "@/components/account/AccountShell";
import { RequirementStatusChip } from "@/components/account/RequirementProgress";
import { listBuyerRequirements } from "@/server/services/buyer-account.service";
import { PURPOSE_LABELS, TIMELINE_LABELS } from "@/lib/validation/requirement";

export const metadata: Metadata = {
  title: "My requirements",
  robots: { index: false, follow: false },
};

/**
 * The buyer's requirements. Status is derived from the leads (see
 * buyer-account.service) rather than stored, so it can never drift.
 */
export default async function MyRequirementsPage() {
  const user = await requireBuyerPage("/account/requirements");
  const requirements = await listBuyerRequirements(user.id);

  return (
    <AccountShell userId={user.id} active="requirements">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">My requirements</h1>
        <Link
          href="/post-requirement"
          className="inline-flex min-h-11 items-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Post a requirement
        </Link>
      </div>

      {requirements.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center">
          <p className="text-sm text-neutral-600">You haven&apos;t sent any requirements yet.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {requirements.map((requirement) => (
            <li key={requirement.id}>
              <Link
                href={`/account/requirements/${requirement.id}`}
                className="hover:border-brand-300 block rounded-lg border border-neutral-200 bg-white p-4 text-sm transition-colors"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-neutral-900">{requirement.productName}</span>
                  <RequirementStatusChip
                    progress={requirement.progress}
                    closed={requirement.closedAt !== null}
                  />
                </div>
                <p className="mt-1 text-neutral-600">
                  {requirement.quantity} {requirement.quantityUnit} · {requirement.location.name} ·{" "}
                  {requirement.category.name}
                </p>
                <p className="mt-1 text-neutral-500">
                  {TIMELINE_LABELS[requirement.timeline]} · {PURPOSE_LABELS[requirement.purpose]} ·
                  sent to {requirement.progress.sent} supplier
                  {requirement.progress.sent === 1 ? "" : "s"} ·{" "}
                  <time dateTime={requirement.createdAt.toISOString()}>
                    {requirement.createdAt.toLocaleDateString("en-IN")}
                  </time>
                </p>
                <span className="text-brand-700 mt-2 inline-block font-medium">View details →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AccountShell>
  );
}
