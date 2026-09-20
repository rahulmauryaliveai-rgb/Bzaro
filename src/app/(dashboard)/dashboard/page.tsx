import Link from "next/link";
import { requireSeller, scopeSurface } from "@/lib/auth/guards";
import { forSeller } from "@/lib/db-tenant";
import { getIndexEligibilityRules } from "@/server/services/indexability.service";
import { getDashboardSnapshot } from "@/server/services/seller.service";
import { evaluateEligibility } from "@/lib/validation/index-eligibility";
import { EligibilityChecklist } from "@/components/dashboard/EligibilityChecklist";
import { ProfileCompletionBar } from "@/components/dashboard/ProfileCompletionBar";
import { getProfileCompletion, stepPath } from "@/server/services/onboarding.service";
import { sellerSiteUrl } from "@/lib/utils/url";

/**
 * Dashboard overview.
 *
 * Leads with the eligibility checklist rather than with metrics. A new seller's
 * most pressing question is "why isn't my site showing up", and answering it
 * before they have to ask is the difference between a support ticket and a
 * completed profile.
 *
 * Data access follows the standard dashboard pattern:
 *
 *   const scope = await requireSeller();      // prove ownership
 *   const tdb   = forSeller(scope.sellerId);  // scope every query
 *
 * `tdb` cannot express a cross-tenant query. ESLint blocks importing the
 * unscoped `db` from this route group at all, so the seller's own row is read
 * through a service that takes an already-authorised `sellerId`.
 */

type Props = { searchParams: Promise<{ welcome?: string }> };

export default async function DashboardOverviewPage({ searchParams }: Props) {
  const scope = await requireSeller();
  const { welcome } = await searchParams;

  const tdb = forSeller(scope.sellerId);

  const [seller, rules, products, services, enquiries, newEnquiries, flagged, newLeads, profile] =
    await Promise.all([
      getDashboardSnapshot(scope.sellerId),
      getIndexEligibilityRules(),
      tdb.product.count({
        where: { status: "PUBLISHED", deletedAt: null, moderationStatus: "APPROVED" },
      }),
      tdb.service.count({
        where: { status: "PUBLISHED", deletedAt: null, moderationStatus: "APPROVED" },
      }),
      tdb.enquiry.count({ where: { isSpam: false } }),
      tdb.enquiry.count({ where: { status: "NEW", isSpam: false } }),
      tdb.product.count({ where: { moderationStatus: "FLAGGED", deletedAt: null } }),
      tdb.lead.count({ where: { status: "NEW" } }),
      getProfileCompletion(scope.sellerId),
    ]);

  if (!seller) throw new Error("Seller not found for an authorised scope");

  // Evaluated live rather than read from the stored flag. The stored value is
  // for robots.txt and metadata, where it must be cheap; here the seller needs
  // the full list of what is missing, which only the evaluation produces.
  const eligibility = evaluateEligibility(
    {
      status: seller.status,
      businessName: seller.businessName,
      description: seller.description,
      logoUrl: seller.logoUrl,
      coverImageUrl: seller.coverImageUrl,
      locationId: seller.locationId,
      addressLine1: seller.addressLine1,
      phone: seller.phone,
      whatsapp: seller.whatsapp,
      email: seller.email,
      verifiedAt: seller.verifiedAt,
      phoneVerified: Boolean(seller.members[0]?.user.phoneVerified),
      publishedProducts: products,
      publishedServices: services,
      flaggedContent: flagged,
      websitePublishedAt: seller.website?.publishedAt ?? null,
    },
    rules,
  );

  const isPending = seller.status === "PENDING_VERIFICATION";

  return (
    <div className="space-y-8">
      {welcome ? (
        <div className="rounded-lg border border-teal-600 bg-teal-50 p-5">
          <h2 className="font-medium text-teal-900">{seller.businessName} is registered</h2>
          <p className="mt-1 text-sm text-teal-800">
            Your web address is reserved. Next: fill in your profile so your site has something to
            show.
          </p>
          <Link
            href="/dashboard/profile"
            className="mt-3 inline-block rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white"
          >
            Complete your profile
          </Link>
        </div>
      ) : null}

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{seller.businessName}</h1>
        <p className="mt-1 text-sm text-neutral-600">
          <a
            href={sellerSiteUrl(scopeSurface(scope))}
            target="_blank"
            rel="noopener noreferrer"
            className="text-teal-700 underline underline-offset-2"
          >
            {sellerSiteUrl(scopeSurface(scope)).replace(/^https?:\/\//, "")}
          </a>
        </p>
      </header>

      {/*
        Verification status comes before the checklist: while pending, the site
        is not publicly reachable at all, which makes every other item moot.
      */}
      {profile ? (
        <ProfileCompletionBar
          completion={profile.completion}
          onboardingStep={profile.onboardingStep}
          resumeHref={stepPath(profile.onboardingStep)}
        />
      ) : null}

      {isPending ? (
        <section className="rounded-lg border border-neutral-300 bg-white p-5">
          <h2 className="font-medium">Verification in progress</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Your website address is reserved but not publicly reachable until we verify your
            business — usually within a working day. You can fill in everything now so it goes live
            complete.
          </p>
        </section>
      ) : (
        <EligibilityChecklist result={eligibility} />
      )}

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Products" value={products} href="/dashboard/products" />
        <Stat label="Services" value={services} href="/dashboard/services" />
        <Stat label="Enquiries" value={enquiries} href="/dashboard/enquiries" />
        <Stat
          label="New enquiries"
          value={newEnquiries}
          href="/dashboard/enquiries"
          highlight={newEnquiries > 0}
        />
        <Stat label="New leads" value={newLeads} href="/dashboard/leads" highlight={newLeads > 0} />
      </dl>

      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-neutral-500 uppercase">
          Quick actions
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          <QuickLink href="/dashboard/profile" label="Edit business profile" />
          <QuickLink href="/dashboard/website" label="Change template and colours" />
          <QuickLink href="/dashboard/enquiries" label="Read enquiries" />
          <QuickLink href="/dashboard/settings" label="Account settings" />
        </ul>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  href,
  highlight,
}: {
  label: string;
  value: number;
  href: string;
  highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`block rounded-lg border bg-white p-4 transition-shadow hover:shadow-md ${
        highlight ? "border-teal-600" : "border-neutral-200"
      }`}
    >
      <dt className="text-xs font-medium tracking-wide text-neutral-500 uppercase">{label}</dt>
      <dd className="mt-1 text-3xl font-semibold tabular-nums">{value}</dd>
    </Link>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <li>
      <Link
        href={href}
        className="block rounded-md border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
      >
        {label} →
      </Link>
    </li>
  );
}
