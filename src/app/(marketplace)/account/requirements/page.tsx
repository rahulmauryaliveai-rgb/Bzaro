import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { PURPOSE_LABELS, TIMELINE_LABELS } from "@/lib/validation/requirement";

export const metadata: Metadata = {
  title: "My requirements",
  robots: { index: false, follow: false },
};

/**
 * The buyer's own requirements (Phase 7).
 *
 * Status is derived from the leads it produced, not stored: "Sent" until a
 * seller opens it, "Viewed" once one has, "Responded" once one accepts. A
 * separate status column would be a second source of truth that drifts.
 */
function deriveStatus(leads: Array<{ status: string }>): {
  label: string;
  className: string;
} {
  if (leads.some((lead) => ["ACCEPTED", "CONTACTED", "WON"].includes(lead.status))) {
    return { label: "Responded", className: "bg-green-100 text-green-900" };
  }
  if (leads.some((lead) => lead.status === "VIEWED")) {
    return { label: "Viewed", className: "bg-amber-100 text-amber-900" };
  }
  return { label: "Sent", className: "bg-neutral-200 text-neutral-800" };
}

export default async function MyRequirementsPage() {
  const user = await requireUser("/account/requirements");

  const requirements = await db.requirement.findMany({
    where: { buyerId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      productName: true,
      quantity: true,
      quantityUnit: true,
      timeline: true,
      purpose: true,
      createdAt: true,
      category: { select: { name: true } },
      location: { select: { name: true } },
      leads: { select: { status: true } },
    },
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <nav className="mb-6 flex flex-wrap gap-4 border-b border-neutral-200 pb-3 text-sm">
        <Link href="/account/requirements" className="hover:underline">
          My requirements
        </Link>
        <Link href="/account/orders" className="hover:underline">
          My orders
        </Link>
        <Link href="/account/saved" className="hover:underline">
          Saved suppliers
        </Link>
      </nav>

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
          {requirements.map((requirement) => {
            const status = deriveStatus(requirement.leads);
            return (
              <li
                key={requirement.id}
                className="rounded-lg border border-neutral-200 bg-white p-4 text-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{requirement.productName}</span>
                  <span className={`rounded px-2 py-0.5 text-xs ${status.className}`}>
                    {status.label}
                  </span>
                </div>
                <p className="mt-1 text-neutral-600">
                  {requirement.quantity} {requirement.quantityUnit} · {requirement.location.name} ·{" "}
                  {requirement.category.name}
                </p>
                <p className="mt-1 text-neutral-500">
                  {TIMELINE_LABELS[requirement.timeline]} ·{" "}
                  {PURPOSE_LABELS[requirement.purpose]} ·{" "}
                  {requirement.leads.length} supplier
                  {requirement.leads.length === 1 ? "" : "s"} ·{" "}
                  <time dateTime={requirement.createdAt.toISOString()}>
                    {requirement.createdAt.toLocaleDateString("en-IN")}
                  </time>
                </p>

                {/* Sourcing repeats. Re-posting reaches a fresh set of sellers
                    without retyping — the 7-day dedupe still applies. */}
                <Link
                  href={`/post-requirement?repost=${requirement.id}`}
                  className="mt-3 inline-flex min-h-11 items-center rounded-md border border-neutral-300 px-3 text-sm font-medium hover:bg-neutral-50"
                >
                  Re-post this requirement
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
