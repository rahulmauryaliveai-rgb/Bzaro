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
    "List your business free. Pro gives you a website and weekly buyer leads; Gold adds your own domain, online orders, shipping and top placement.",
  alternates: { canonical: marketplaceUrl("/pricing") },
};

const FAQ = [
  {
    q: "What do I get on the free plan?",
    a: "A verified listing on Bzaro, a catalogue page with your products and contact buttons, and every direct enquiry a buyer sends you — free, on WhatsApp. You are also notified when buyers post requirements that match you; unlock 10 of them any time with a ₹499 lead pack, or join Pro for leads every week.",
  },
  {
    q: "How do weekly leads and credits work?",
    a: "Pro sellers receive up to 10 matched buyer requirements every week plus one lead of the day; Gold sellers up to 20 a week plus one a day. Weekly leads stay open until Sunday night, the lead of the day until the next day. Unlocking a buyer's contact uses one credit — Pro includes 30 credits a month, Gold 80 — and a ₹499 pack adds 10 more whenever you run out.",
  },
  {
    q: "What are the add-ons?",
    a: "Pro sellers can switch on Add to cart and online payments on their website for ₹2,000 (one time), and Shiprocket shipping for ₹5,000 (one time), straight from the dashboard. Both are included in Gold. Prices exclude GST.",
  },
  {
    q: "What is the difference between a catalogue page and a website?",
    a: `A catalogue page lives on ${clientEnv.NEXT_PUBLIC_ROOT_DOMAIN}/seller/your-business. A website is a full site — home, products, services, gallery, about, contact — on your-business.${clientEnv.NEXT_PUBLIC_ROOT_DOMAIN}, with your own colours and logo, that ranks on Google under your name.`,
  },
  {
    q: "How do I pay?",
    a: "From your dashboard, with UPI Autopay, a card or net banking through Razorpay — monthly or yearly. 18% GST is added at checkout and you get a GST invoice for every payment. Your plan starts the moment the payment goes through.",
  },
  {
    q: "Can I get a refund?",
    a: "Yes, if Bzaro is not sending you leads for your product or service category. Request it from Plan & billing within 7 days of a plan payment; our team reviews the leads you received and replies within 2 working days. Add-ons and lead packs are not refundable.",
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
          Every plan includes a verified listing and free direct enquiries. Pro adds your own
          website and fresh buyer leads every week; Gold adds your own domain, online orders,
          shipping, a Trust Seal and top placement.
        </p>
        <ul className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-neutral-600">
          {["No commission on deals", "Cancel autopay any time", "Prices in INR + 18% GST"].map(
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
