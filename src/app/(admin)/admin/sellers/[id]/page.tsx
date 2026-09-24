import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { getSellerForAdmin } from "@/server/services/admin.service";
import { getSellerCreditsForAdmin } from "@/server/services/admin-leads.service";
import { AdjustCreditsForm } from "@/components/admin/AdjustCreditsForm";
import {
  reinstateSellerAction,
  rejectSellerAction,
  suspendSellerAction,
  verifySellerAction,
} from "@/server/actions/admin";
import { StatusBadge } from "@/app/(admin)/admin/sellers/page";
import { sellerSiteUrl } from "@/lib/utils/url";
import { changePlanAction } from "@/server/actions/billing";
import { adminSetTemplateAction, setSellerFeaturesAction } from "@/server/actions/admin";
import { getSellerFeatures } from "@/server/services/integration.service";
import { listActiveTemplates } from "@/server/services/seller.service";
import { getActivePlan, listPublicPlans } from "@/server/services/plan.service";

const FEATURE_SOURCE_LABEL: Record<string, string> = {
  PLAN: "From plan",
  ADDON: "Add-on",
  ADMIN_OVERRIDE: "Admin override",
};

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

  const [credits, subscription, plans, templates, features] = await Promise.all([
    getSellerCreditsForAdmin(seller.id),
    getActivePlan(seller.id),
    listPublicPlans(),
    listActiveTemplates(),
    getSellerFeatures(seller.id),
  ]);

  const canVerify = can(user.role, "admin:seller:verify");
  const canSuspend = can(user.role, "admin:seller:suspend");
  const canAdjust = can(user.role, "admin:credit:adjust");
  const canChangePlan = can(user.role, "admin:subscription:manage");
  const canEditWebsite = can(user.role, "admin:seller:website");

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
          href={sellerSiteUrl(seller)}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-neutral-700 px-3 py-1.5 hover:bg-neutral-800"
        >
          {seller.webPresence === "CATALOGUE" ? "View catalogue page ↗" : "View site ↗"}
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

      <Section title="Plan & web presence">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-neutral-500">Plan</dt>
            <dd className="font-medium">{subscription?.plan.name ?? "Free"}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Period ends</dt>
            <dd className="tabular-nums">
              {subscription ? subscription.currentPeriodEnd.toLocaleDateString("en-IN") : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">Web presence (D32)</dt>
            <dd className="font-mono text-xs">{seller.webPresence}</dd>
          </div>
        </dl>
        {canChangePlan ? (
          <form action={changePlanAction} className="mt-4 flex flex-wrap items-end gap-3 text-sm">
            <input type="hidden" name="sellerId" value={seller.id} />
            <label className="flex flex-col gap-1">
              <span className="text-xs text-neutral-500">Move to plan</span>
              <select
                name="planId"
                defaultValue={subscription?.plan.id ?? ""}
                className="rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1.5"
              >
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} · {plan.webPresence.toLowerCase().replace("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded-md bg-white px-3 py-1.5 font-medium text-neutral-900 hover:bg-neutral-200"
            >
              Change plan
            </button>
            <span className="text-xs text-neutral-500">
              Starts a new 30-day period today; the subdomain follows the tier immediately.
            </span>
          </form>
        ) : null}
      </Section>

      <Section title="Website template">
        <p className="text-sm">
          Current: <span className="font-medium">{seller.website?.template?.name ?? "—"}</span>
        </p>
        {canEditWebsite ? (
          <form
            action={adminSetTemplateAction}
            className="mt-3 flex flex-wrap items-end gap-3 text-sm"
          >
            <input type="hidden" name="sellerId" value={seller.id} />
            <label className="flex flex-col gap-1">
              <span className="text-xs text-neutral-500">Switch to</span>
              <select
                name="templateKey"
                defaultValue={seller.website?.template?.key ?? ""}
                className="rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1.5"
              >
                {templates.map((template) => (
                  <option key={template.key} value={template.key}>
                    {template.name}
                    {template.isPremium ? " (premium)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded-md bg-white px-3 py-1.5 font-medium text-neutral-900 hover:bg-neutral-200"
            >
              Apply template
            </button>
            <span className="text-xs text-neutral-500">
              Applies the template&apos;s preset colours; the seller can retune them.
            </span>
          </form>
        ) : null}
      </Section>

      {can(user.role, "admin:seller:features") ? (
        <Section title="Paid features">
          <p className="mb-3 text-sm text-neutral-400">
            Currently:{" "}
            <span className="text-neutral-200">
              Payments {features.paymentsEnabled ? "on" : "off"} · Shipping{" "}
              {features.shippingEnabled ? "on" : "off"}
            </span>{" "}
            <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs">
              {FEATURE_SOURCE_LABEL[features.source]}
            </span>
          </p>
          <form action={setSellerFeaturesAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="sellerId" value={seller.id} />
            <label className="text-sm">
              <span className="mb-1 block text-neutral-500">Payments</span>
              <select
                name="payments"
                defaultValue={features.paymentsEnabled ? "on" : "off"}
                className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2"
              >
                <option value="off">Off</option>
                <option value="on">On</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-neutral-500">Shipping</span>
              <select
                name="shipping"
                defaultValue={features.shippingEnabled ? "on" : "off"}
                className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2"
              >
                <option value="off">Off</option>
                <option value="on">On</option>
              </select>
            </label>
            <label className="flex-1 text-sm">
              <span className="mb-1 block text-neutral-500">Note (audit trail)</span>
              <input
                name="note"
                maxLength={1000}
                className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2"
              />
            </label>
            <button
              type="submit"
              className="rounded-md bg-white px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-200"
            >
              Apply override
            </button>
          </form>
          <p className="mt-2 text-xs text-neutral-500">
            Saving records this as an admin override, which the plan sweep will not undo.
          </p>
        </Section>
      ) : null}

      {credits ? (
        <Section title="Lead credits">
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-neutral-500">Balance</dt>
              <dd className="text-lg font-semibold tabular-nums">{credits.creditBalance}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Plan</dt>
              <dd>
                {credits.plan?.name ?? "—"}
                {credits.plan ? (
                  <span className="text-neutral-500">
                    {" "}
                    · {credits.plan.leadCreditsPerMonth ?? 0}/mo
                  </span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">Market leads</dt>
              <dd className="tabular-nums">
                {credits.leadsAccepted} / {credits.leadsReceived} accepted
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">Response rate</dt>
              <dd className="tabular-nums">
                {credits.responseRate === null ? "—" : `${Math.round(credits.responseRate * 100)}%`}
              </dd>
            </div>
          </dl>
          {canAdjust ? <AdjustCreditsForm sellerId={seller.id} /> : null}
          {credits.entries.length > 0 ? (
            <ul className="mt-4 space-y-1 text-xs text-neutral-400">
              {credits.entries.map((entry) => (
                <li key={entry.id} className="flex justify-between gap-4">
                  <span>
                    {entry.createdAt.toLocaleDateString("en-IN")} · {entry.reason.toLowerCase()}
                    {entry.periodKey ? ` ${entry.periodKey}` : ""}
                    {entry.note ? ` · ${entry.note}` : ""}
                  </span>
                  <span className="tabular-nums">
                    {entry.delta > 0 ? `+${entry.delta}` : entry.delta} → {entry.balanceAfter}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
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
