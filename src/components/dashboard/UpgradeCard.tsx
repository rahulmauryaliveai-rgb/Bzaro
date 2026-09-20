import Link from "next/link";
import { Globe2 } from "lucide-react";
import { PlanLadder, type PublicPlan } from "@/components/billing/PlanLadder";

/**
 * Shown to catalogue-tier sellers where the website editor would be
 * (decision D32): what a website adds, and the ladder to get one.
 */
const RANK = { CATALOGUE: 0, SUBDOMAIN: 1, CUSTOM_DOMAIN: 2 } as const;

export function UpgradeCard({
  currentPlanKey,
  currentWebPresence,
  plans,
}: {
  currentPlanKey: string;
  currentWebPresence: keyof typeof RANK;
  plans: PublicPlan[];
}) {
  // Only tiers that actually add a surface. Offering "Upgrade" to a plan
  // below the seller's own is noise.
  const upgrades = plans.filter((plan) => RANK[plan.webPresence] > RANK[currentWebPresence]);
  if (upgrades.length === 0) return null;

  return (
    <section className="border-brand-200 from-brand-50 rounded-2xl border bg-linear-to-br to-white p-6">
      <p className="text-brand-800 inline-flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
        <Globe2 className="h-4 w-4" aria-hidden="true" />
        Get your own website
      </p>
      <h2 className="mt-2 text-xl font-semibold text-neutral-900">
        Your business on its own web address
      </h2>
      <p className="mt-1 max-w-xl text-sm text-neutral-600">
        A Gold plan gives you a full website — home, products, services, gallery, about and contact
        pages — that ranks on Google under your own name, with your own colours and logo. Everything
        you have already added is published there instantly.
      </p>
      <div className="mt-6">
        <PlanLadder
          plans={upgrades}
          currentPlanKey={currentPlanKey}
          ctaHref={(plan) => `/dashboard/billing?plan=${plan.key}`}
          ctaLabel="Upgrade"
        />
      </div>
      <p className="mt-4 text-xs text-neutral-500">
        <Link href="/dashboard/billing" className="underline underline-offset-2">
          Plan &amp; billing
        </Link>
      </p>
    </section>
  );
}
