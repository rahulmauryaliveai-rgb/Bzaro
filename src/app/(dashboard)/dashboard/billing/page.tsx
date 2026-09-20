import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircle, Mail } from "lucide-react";
import { requireSeller } from "@/lib/auth/guards";
import { getSetting } from "@/lib/settings";
import {
  BILLING_SETTINGS_KEY,
  DEFAULT_BILLING_SETTINGS,
  billingSettingsSchema,
} from "@/lib/validation/billing-settings";
import {
  getActivePlan,
  getLastUpgradeRequest,
  listPublicPlans,
} from "@/server/services/plan.service";
import { getSellerProfile } from "@/server/services/seller.service";
import { requestUpgradeAction } from "@/server/actions/billing";
import { PlanLadder, formatPlanPrice } from "@/components/billing/PlanLadder";

export const metadata: Metadata = {
  title: "Plan & billing",
  robots: { index: false, follow: false },
};

/**
 * Plan & billing (decision D32).
 *
 * Without a payment gateway the flow is: pick a plan → see how to pay →
 * tell us. The admin then assigns the plan from the seller's admin page, and
 * the web-presence tier follows. `?plan=<key>` selects a plan; the request
 * button writes an audit row so the team has a queue to work from.
 */

type Props = { searchParams: Promise<{ plan?: string; requested?: string }> };

export default async function BillingPage({ searchParams }: Props) {
  const scope = await requireSeller();
  const { plan: wantedKey, requested } = await searchParams;

  const [subscription, plans, profile, billing, lastRequest] = await Promise.all([
    getActivePlan(scope.sellerId),
    listPublicPlans(),
    getSellerProfile(scope.sellerId),
    getSetting(BILLING_SETTINGS_KEY, billingSettingsSchema, DEFAULT_BILLING_SETTINGS),
    getLastUpgradeRequest(scope.sellerId),
  ]);

  const currentKey = subscription?.plan.key ?? "free";
  const wanted = plans.find((plan) => plan.key === wantedKey && plan.key !== currentKey);

  return (
    <div className="max-w-4xl space-y-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Plan &amp; billing</h1>
        <p className="mt-1 text-sm text-neutral-600">
          You are on the <strong>{subscription?.plan.name ?? "Free"}</strong> plan
          {subscription ? (
            <>
              {" "}
              until{" "}
              {subscription.currentPeriodEnd.toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </>
          ) : null}
          .
        </p>
      </header>

      {wanted ? (
        <section className="border-brand-200 bg-brand-50 rounded-2xl border p-6">
          <h2 className="text-lg font-semibold text-neutral-900">
            Upgrade to {wanted.name} — {formatPlanPrice(wanted).amount}{" "}
            <span className="text-sm font-normal text-neutral-600">
              {formatPlanPrice(wanted).period}
            </span>
          </h2>

          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            {billing.upiId ? (
              <div className="rounded-lg bg-white p-3">
                <dt className="text-xs tracking-wide text-neutral-500 uppercase">Pay via UPI</dt>
                <dd className="mt-0.5 font-mono font-medium">{billing.upiId}</dd>
              </div>
            ) : null}
            <div className="rounded-lg bg-white p-3">
              <dt className="text-xs tracking-wide text-neutral-500 uppercase">Reference</dt>
              <dd className="mt-0.5 font-mono font-medium">
                {scope.sellerSlug} / {wanted.key}
              </dd>
            </div>
          </dl>

          {billing.instructions ? (
            <p className="mt-4 text-sm whitespace-pre-line text-neutral-700">
              {billing.instructions}
            </p>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {billing.supportWhatsapp ? (
              <a
                href={`https://wa.me/${billing.supportWhatsapp}?text=${encodeURIComponent(
                  `Hi, I want to upgrade ${profile?.businessName ?? scope.sellerSlug} (${scope.sellerSlug}) to the ${wanted.name} plan.`,
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-accent-600 hover:bg-accent-700 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white"
              >
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                Message us on WhatsApp
              </a>
            ) : null}
            {billing.supportEmail ? (
              <a
                href={`mailto:${billing.supportEmail}?subject=${encodeURIComponent(
                  `Upgrade ${scope.sellerSlug} to ${wanted.name}`,
                )}`}
                className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium hover:bg-neutral-50"
              >
                <Mail className="h-4 w-4" aria-hidden="true" />
                Email us
              </a>
            ) : null}
            <form action={requestUpgradeAction}>
              <input type="hidden" name="plan" value={wanted.key} />
              <button
                type="submit"
                className="border-brand-300 text-brand-800 hover:bg-brand-100 inline-flex items-center rounded-lg border bg-white px-4 py-2.5 text-sm font-medium"
              >
                Notify the Bzaro team
              </button>
            </form>
          </div>

          {requested || lastRequest ? (
            <p className="mt-3 text-xs text-neutral-600">
              {lastRequest
                ? `Last request sent ${lastRequest.createdAt.toLocaleString("en-IN")}. We will activate the plan once payment is confirmed.`
                : null}
            </p>
          ) : null}
        </section>
      ) : null}

      <section>
        <h2 className="mb-5 text-lg font-semibold">Plans</h2>
        <PlanLadder
          plans={plans}
          currentPlanKey={currentKey}
          slug={scope.sellerSlug}
          ctaHref={(plan) => `/dashboard/billing?plan=${plan.key}`}
          ctaLabel="Choose plan"
        />
        <p className="mt-4 text-xs text-neutral-500">
          Prices exclude GST. Plans renew monthly; downgrades take effect at the end of the current
          period, and a website that is no longer included redirects to your catalogue page on Bzaro
          so your links keep working.{" "}
          <Link href="/dashboard/credits" className="underline underline-offset-2">
            About lead credits
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
