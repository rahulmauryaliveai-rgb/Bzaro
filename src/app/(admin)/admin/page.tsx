import Link from "next/link";
import { requirePermission } from "@/lib/auth/guards";
import { getPlatformStats } from "@/server/services/admin.service";

/**
 * Platform overview.
 *
 * Leads with what needs a human: pending verifications and the moderation
 * queue. A dashboard that opens on vanity totals buries the two numbers that
 * actually represent blocked work.
 */
export default async function AdminDashboardPage() {
  await requirePermission("admin:seller:read");
  const stats = await getPlatformStats();

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Platform overview</h1>
      <p className="mt-1 text-sm text-neutral-400">Everything needing attention, first.</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <ActionCard
          label="Pending verification"
          value={stats.pending}
          href="/admin/sellers/pending"
          cta="Review sellers"
          urgent={stats.pending > 0}
        />
        <ActionCard
          label="Awaiting moderation"
          value={stats.pendingModeration}
          href="/admin/moderation"
          cta="Review content"
          urgent={stats.pendingModeration > 0}
        />
      </div>

      <dl className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Sellers" value={stats.sellers} />
        <Stat label="Verified" value={stats.verified} />
        <Stat label="Suspended" value={stats.suspended} />
        <Stat label="Indexable sites" value={stats.indexable} />
        <Stat label="Products" value={stats.products} />
        <Stat label="Enquiries" value={stats.enquiries} />
        <Stat label="Enquiries (30d)" value={stats.recentEnquiries} />
      </dl>

      {/* The ratio that matters for decision D2: verified sellers whose sites
          are still not indexable are sellers with incomplete profiles. */}
      {stats.verified > 0 ? (
        <p className="mt-8 rounded-lg border border-neutral-700 bg-neutral-800 p-4 text-sm text-neutral-300">
          <span className="font-medium text-white tabular-nums">
            {stats.verified - stats.indexable}
          </span>{" "}
          verified sellers are not yet indexable — their profiles are incomplete.{" "}
          <Link href="/admin/settings" className="underline underline-offset-2">
            Review the eligibility rules
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}

function ActionCard({
  label,
  value,
  href,
  cta,
  urgent,
}: {
  label: string;
  value: number;
  href: string;
  cta: string;
  urgent: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-5 ${
        urgent ? "border-amber-500 bg-amber-950/30" : "border-neutral-700 bg-neutral-800"
      }`}
    >
      <p className="text-xs font-medium tracking-wide text-neutral-400 uppercase">{label}</p>
      <p className="mt-1 text-4xl font-semibold tabular-nums">{value}</p>
      <Link href={href} className="mt-3 inline-block text-sm underline underline-offset-2">
        {cta} →
      </Link>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-800 p-4">
      <dt className="text-xs font-medium tracking-wide text-neutral-400 uppercase">{label}</dt>
      <dd className="mt-1 text-3xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
