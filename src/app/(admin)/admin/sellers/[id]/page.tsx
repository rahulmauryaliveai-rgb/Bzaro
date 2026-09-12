import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { getSellerForAdmin } from "@/server/services/admin.service";
import {
  reinstateSellerAction,
  rejectSellerAction,
  suspendSellerAction,
  verifySellerAction,
} from "@/server/actions/admin";
import { StatusBadge } from "@/app/(admin)/admin/sellers/page";
import { tenantUrl } from "@/lib/utils/url";

/**
 * Seller detail — the verification workstation (decision D8).
 *
 * Everything a reviewer needs to make a decision is on one screen, because a
 * decision that requires four tabs gets made carelessly.
 *
 * Note what is NOT here: the KYC document CONTENTS. Documents live in a private
 * bucket and are fetched through short-lived signed URLs; this page lists what
 * was uploaded and its review state only. Rendering the files inline would put
 * identity documents into a page that could be cached or screenshotted.
 * (The signed-URL viewer is Phase 10 work — see docs/SECURITY.md §6.)
 */

type Props = { params: Promise<{ id: string }> };

export default async function AdminSellerDetailPage({ params }: Props) {
  const user = await requirePermission("admin:seller:read");
  const { id } = await params;

  const seller = await getSellerForAdmin(id);
  if (!seller) notFound();

  const canVerify = can(user.role, "admin:seller:verify");
  const canSuspend = can(user.role, "admin:seller:suspend");

  const owner = seller.members.find((m) => m.role === "SELLER_OWNER")?.user;

  return (
    <div className="max-w-3xl">
      <Link href="/admin/sellers" className="text-sm text-neutral-400 hover:text-white">
        ← All sellers
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{seller.businessName}</h1>
          <p className="mt-1 font-mono text-sm text-neutral-500">{seller.slug}</p>
        </div>
        <StatusBadge status={seller.status} />
      </header>

      <div className="mt-6 flex flex-wrap gap-3 text-sm">
        <a
          href={tenantUrl(seller.slug)}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-neutral-700 px-3 py-1.5 hover:bg-neutral-800"
        >
          View site ↗
        </a>
        <Link
          href={`/seller/${seller.slug}`}
          className="rounded-md border border-neutral-700 px-3 py-1.5 hover:bg-neutral-800"
        >
          Marketplace profile
        </Link>
      </div>

      <Section title="Business details">
        <Row label="Legal name" value={seller.legalName} />
        <Row label="Email" value={seller.email} />
        <Row label="Phone" value={seller.phone} />
        <Row label="WhatsApp" value={seller.whatsapp} />
        <Row label="Address" value={seller.addressLine1} />
        <Row label="Location" value={seller.location?.name} />
        <Row label="GSTIN" value={seller.gstin} mono />
        <Row label="PAN" value={seller.pan} mono />
        <Row label="Established" value={seller.establishedYear?.toString()} />
        <Row label="Employees" value={seller.employeeCount} />
      </Section>

      <Section title="Account">
        <Row label="Owner" value={owner?.name ?? owner?.email} />
        <Row label="Email verified" value={owner?.emailVerified ? "Yes" : "No"} />
        <Row label="Phone verified" value={owner?.phoneVerified ? "Yes" : "No"} />
        <Row label="Registered" value={seller.createdAt.toISOString().slice(0, 10)} />
      </Section>

      <Section title="Content">
        <Row label="Products" value={String(seller.productCount)} />
        <Row label="Services" value={String(seller.serviceCount)} />
        <Row label="Enquiries" value={String(seller._count.enquiries)} />
        <Row label="Profile score" value={`${seller.profileScore}%`} />
        <Row
          label="Indexable"
          value={
            seller.website?.indexable
              ? "Yes"
              : `No — ${seller.website?.indexBlockReason ?? "not evaluated"}`
          }
        />
        <Row label="Description" value={`${seller.description?.length ?? 0} characters`} />
      </Section>

      <Section title="Verification documents">
        {seller.documents.length === 0 ? (
          <p className="text-sm text-neutral-500">No documents uploaded.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {seller.documents.map((document) => (
              <li key={document.id} className="flex items-center justify-between gap-4">
                <span>{document.type.replace(/_/g, " ").toLowerCase()}</span>
                <span className="text-neutral-400">{document.status.toLowerCase()}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-neutral-500">
          Documents are stored privately. Signed-URL viewing arrives with the upload pipeline.
        </p>
      </Section>

      {seller.status === "PENDING_VERIFICATION" && canVerify ? (
        <Section title="Decision">
          <form action={verifySellerAction} className="mb-6">
            <input type="hidden" name="sellerId" value={seller.id} />
            <button
              type="submit"
              className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-500"
            >
              Verify this business
            </button>
            <p className="mt-2 text-xs text-neutral-500">
              Makes the microsite publicly reachable and recomputes indexability.
            </p>
          </form>

          <form action={rejectSellerAction} className="space-y-2">
            <input type="hidden" name="sellerId" value={seller.id} />
            <label htmlFor="reject-reason" className="block text-sm font-medium">
              Reject with a reason
            </label>
            <textarea
              id="reject-reason"
              name="reason"
              required
              minLength={10}
              maxLength={1000}
              rows={3}
              placeholder="What the seller needs to fix — this is emailed to them."
              className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-md border border-neutral-600 px-4 py-2 text-sm font-medium hover:bg-neutral-800"
            >
              Reject
            </button>
          </form>
        </Section>
      ) : null}

      {canSuspend && (seller.status === "VERIFIED" || seller.status === "PENDING_VERIFICATION") ? (
        <Section title="Suspend">
          <form action={suspendSellerAction} className="space-y-2">
            <input type="hidden" name="sellerId" value={seller.id} />
            <textarea
              name="reason"
              required
              minLength={5}
              maxLength={1000}
              rows={2}
              placeholder="Reason (recorded in the audit log)"
              className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm"
            />
            <label className="flex items-center gap-2 text-sm text-neutral-300">
              <input type="checkbox" name="ban" />
              Ban permanently
            </label>
            <button
              type="submit"
              className="rounded-md border border-red-800 bg-red-950 px-4 py-2 text-sm font-medium text-red-200"
            >
              Suspend
            </button>
            <p className="text-xs text-neutral-500">
              Signs out every member immediately and takes the site offline.
            </p>
          </form>
        </Section>
      ) : null}

      {canSuspend && (seller.status === "SUSPENDED" || seller.status === "REJECTED") ? (
        <Section title="Reinstate">
          <form action={reinstateSellerAction}>
            <input type="hidden" name="sellerId" value={seller.id} />
            <button
              type="submit"
              className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white"
            >
              Reinstate as verified
            </button>
          </form>
        </Section>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 rounded-lg border border-neutral-700 bg-neutral-800 p-5">
      <h2 className="mb-4 text-sm font-semibold tracking-wide text-neutral-400 uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="flex gap-4 border-b border-neutral-700 py-2 text-sm last:border-0">
      <dt className="w-40 shrink-0 text-neutral-400">{label}</dt>
      <dd className={mono ? "font-mono text-xs" : ""}>
        {value ?? <span className="text-neutral-600">Not provided</span>}
      </dd>
    </div>
  );
}
