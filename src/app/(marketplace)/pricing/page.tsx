import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { listPublicPlans } from "@/server/services/plan.service";
import { PlanLadder } from "@/components/billing/PlanLadder";
import { SectionHeading } from "@/components/marketplace/Home";
import { marketplaceUrl } from "@/lib/utils/url";
import { clientEnv } from "@/env.client";

/**
 * Public pricing (decision D32). The ladder is data from the `Plan` table so
 * an admin edit is live within the hour; the copy around it is the only part
 * that lives here.
 */

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Pricing for sellers",
  description:
    "List your business free. Upgrade for more catalogue, buyer leads and your own website.",
  alternates: { canonical: marketplaceUrl("/pricing") },
};

const FAQ = [
  {
    q: "What do I get on the free plan?",
    a: "A verified listing on Bzaro, a catalogue page with your products and contact buttons, and every direct enquiry a buyer sends you — free, on WhatsApp.",
  },
  {
    q: "What is the difference between a catalogue page and a website?",
    a: `A catalogue page lives on ${clientEnv.NEXT_PUBLIC_ROOT_DOMAIN}/seller/your-business. A website is a full site — home, products, services, gallery, about, contact — on your-business.${clientEnv.NEXT_PUBLIC_ROOT_DOMAIN}, with your own colours and logo, that ranks on Google under your name.`,
  },
  {
    q: "How do I pay?",
    a: "Choose a plan from your dashboard, pay by UPI or bank transfer, and send us the reference. We activate the plan within one working day. Online card payments are coming.",
  },
  {
    q: "What happens if I downgrade?",
    a: "Your website redirects to your catalogue page on Bzaro, so every link you have shared keeps working. Your products and enquiries are untouched.",
  },
] as const;

export default async function PricingPage() {
  // The page itself is ISR; no second cache layer whose tag nothing purges.
  const plans = await listPublicPlans();

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-accent-700 text-xs font-semibold tracking-wide uppercase">
          Pricing for sellers
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-balance text-neutral-900 sm:text-5xl">
          Start free. Grow into{" "}
          <span className="from-brand-700 to-accent-600 bg-linear-to-r bg-clip-text text-transparent">
            your own website
          </span>
          .
        </h1>
        <p className="mt-4 text-lg text-neutral-600">
          Every plan includes a verified listing and free direct enquiries. Paid plans add catalogue
          room, matched buyer requirements and a website of your own.
        </p>
        <ul className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-neutral-600">
          {["No commission on deals", "Cancel any time", "Prices in INR, exclusive of GST"].map(
            (item) => (
              <li key={item} className="inline-flex items-center gap-1.5">
                <BadgeCheck className="text-accent-600 h-4 w-4" aria-hidden="true" />
                {item}
              </li>
            ),
          )}
        </ul>
      </div>

      <div className="mt-12">
        <PlanLadder
          plans={plans}
          ctaHref={(plan) =>
            plan.priceMinor === 0 ? "/register" : `/dashboard/billing?plan=${plan.key}`
          }
          ctaLabel="Get started"
        />
      </div>

      <div className="mt-20 grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <SectionHeading
          eyebrow="FAQ"
          title="Questions sellers ask"
          description="Still unsure? List your business free and upgrade whenever you are ready."
        />
        <div className="divide-y divide-neutral-200 rounded-2xl border border-neutral-200 bg-white px-6">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-neutral-900">
                {q}
                <span
                  aria-hidden="true"
                  className="bg-brand-50 text-brand-700 flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 pr-10 text-sm leading-relaxed text-neutral-600">{a}</p>
            </details>
          ))}
        </div>
      </div>

      <p className="mt-16 text-center text-sm text-neutral-600">
        Already a seller?{" "}
        <Link
          href="/dashboard/billing"
          className="text-brand-700 font-medium underline underline-offset-2"
        >
          Manage your plan
        </Link>
      </p>
    </div>
  );
}
