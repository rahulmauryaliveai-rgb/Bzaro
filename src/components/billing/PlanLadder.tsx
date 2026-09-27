import Link from "next/link";
import type { ReactNode } from "react";
import { Check, Globe2, Link2, Sparkles } from "lucide-react";
import { formatMoney } from "@/lib/utils/money";
import { clientEnv } from "@/env.client";
import type { listPublicPlans } from "@/server/services/plan.service";

/**
 * The plan ladder, rendered from the `Plan` table. Used on /pricing and in
 * the dashboard upgrade card so the two never disagree about what a plan
 * includes. Every line is derived from a column; nothing is hand-written per
 * plan, so an admin edit to a quota shows up here without a deploy.
 */

export type PublicPlan = Awaited<ReturnType<typeof listPublicPlans>>[number];

const PRESENCE_COPY = {
  CATALOGUE: {
    icon: Link2,
    label: "Catalogue page on Bzaro",
    detail: (slug: string) => `${clientEnv.NEXT_PUBLIC_ROOT_DOMAIN}/seller/${slug}`,
  },
  SUBDOMAIN: {
    icon: Globe2,
    label: "Your own website",
    detail: (slug: string) => `${slug}.${clientEnv.NEXT_PUBLIC_ROOT_DOMAIN}`,
  },
  CUSTOM_DOMAIN: {
    icon: Sparkles,
    label: "Website on your own domain",
    detail: () => "www.yourbusiness.com",
  },
} as const;

export function planFeatures(plan: PublicPlan): string[] {
  const features = [
    plan.maxProducts >= 1000 ? "Unlimited products" : `Up to ${plan.maxProducts} products`,
    `${plan.maxServices} services · ${plan.maxGalleryItems} gallery photos`,
    "Direct buyer enquiries on WhatsApp — free",
  ];

  // Leads (D41): delivery allowance, then the credits that unlock them.
  const weekly = plan.weeklyLeadQuota;
  const daily = plan.dailyLeadQuota;
  const credits = plan.leadCreditsPerMonth;
  if (credits === 0) {
    features.push("Buyer requirements: preview only");
    features.push("Unlock 10 leads anytime with a lead pack");
  } else {
    if (weekly !== null && weekly > 0) {
      features.push(
        `${weekly} matched leads every week${daily > 0 ? ` + ${daily} lead of the day` : ""}`,
      );
    }
    features.push(
      credits === null ? "Unlimited lead credits" : `${credits} lead credits every month`,
    );
  }

  if (plan.includesPayments) features.push("Payment gateway & Add to cart — included");
  else if (plan.webPresence !== "CATALOGUE") features.push("Payment gateway add-on available");
  if (plan.includesShipping) features.push("Shipping integration — included");
  else if (plan.webPresence !== "CATALOGUE") features.push("Shipping add-on available");
  if (plan.trustSeal) features.push("Trust Seal verified badge");
  if (plan.searchBoost > 0 && plan.trustSeal)
    features.push("Top placement in category & city search");
  else if (plan.searchBoost > 0) features.push("Higher placement in search");
  if (plan.allowPremiumTemplates) features.push("Premium website templates");
  if (plan.removeBranding) features.push("No Bzaro branding on your site");
  if (plan.prioritySupport) features.push("Priority support");
  return features;
}

export function formatPlanPrice(plan: PublicPlan): {
  amount: string;
  period: string;
  yearly: string | null;
  yearlySaving: number | null;
} {
  if (plan.priceMinor === 0)
    return { amount: "Free", period: "forever", yearly: null, yearlySaving: null };
  const yearly = plan.yearlyPriceMinor ? formatMoney(plan.yearlyPriceMinor, plan.currency) : null;
  const yearlySaving = plan.yearlyPriceMinor
    ? Math.round((1 - plan.yearlyPriceMinor / (plan.priceMinor * 12)) * 100)
    : null;
  return {
    amount: formatMoney(plan.priceMinor, plan.currency),
    period: "per month + GST",
    yearly,
    yearlySaving: yearlySaving && yearlySaving > 0 ? yearlySaving : null,
  };
}

export function PlanLadder({
  plans,
  currentPlanKey,
  slug = "your-business",
  ctaHref,
  ctaLabel = "Get started",
  highlightKey,
  renderCta,
}: {
  plans: PublicPlan[];
  /** The seller's current plan, when rendering inside the dashboard. */
  currentPlanKey?: string;
  slug?: string;
  /** Where the CTA goes; receives the plan so a form/route can pick it up. */
  ctaHref: (plan: PublicPlan) => string;
  ctaLabel?: string;
  /** Visually emphasised plan (defaults to the first one with a website). */
  highlightKey?: string;
  /** Replaces the link CTA — the dashboard renders checkout buttons here. */
  renderCta?: (
    plan: PublicPlan,
    context: { isCurrent: boolean; isHighlight: boolean },
  ) => ReactNode;
}) {
  const highlight = highlightKey ?? plans.find((plan) => plan.webPresence !== "CATALOGUE")?.key;

  return (
    <ul
      className={`grid gap-5 ${
        plans.length === 1
          ? "max-w-sm"
          : plans.length === 2
            ? "md:grid-cols-2"
            : "md:grid-cols-2 lg:grid-cols-3"
      }`}
    >
      {plans.map((plan) => {
        const presence = PRESENCE_COPY[plan.webPresence];
        const Icon = presence.icon;
        const price = formatPlanPrice(plan);
        const isCurrent = plan.key === currentPlanKey;
        const isHighlight = plan.key === highlight;

        return (
          <li
            key={plan.id}
            className={`relative flex flex-col rounded-2xl border bg-white p-6 ${
              isHighlight
                ? "border-brand-500 shadow-brand-900/10 ring-brand-500 shadow-xl ring-1"
                : "border-neutral-200"
            }`}
          >
            {isHighlight ? (
              <span className="bg-brand-700 absolute -top-3 left-6 rounded-full px-3 py-0.5 text-xs font-semibold text-white">
                Most popular
              </span>
            ) : null}

            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-lg font-semibold text-neutral-900">{plan.name}</h3>
              {isCurrent ? (
                <span className="bg-accent-50 text-accent-800 rounded-full px-2.5 py-0.5 text-xs font-medium">
                  Current plan
                </span>
              ) : null}
            </div>
            {plan.description ? (
              <p className="mt-1 text-sm text-neutral-600">{plan.description}</p>
            ) : null}

            <p className="mt-4">
              <span className="text-3xl font-bold text-neutral-900 tabular-nums">
                {price.amount}
              </span>{" "}
              <span className="text-sm text-neutral-500">{price.period}</span>
            </p>
            {price.yearly ? (
              <p className="mt-1 text-sm text-neutral-600">
                or <span className="font-semibold text-neutral-900">{price.yearly}</span> per year
                {price.yearlySaving ? (
                  <span className="bg-accent-50 text-accent-800 ml-2 rounded-full px-2 py-0.5 text-xs font-medium">
                    save {price.yearlySaving}%
                  </span>
                ) : null}
              </p>
            ) : null}

            <div
              className={`mt-5 flex items-start gap-3 rounded-xl p-3 ${
                plan.webPresence === "CATALOGUE" ? "bg-neutral-50" : "bg-brand-50"
              }`}
            >
              <Icon
                className={`mt-0.5 h-5 w-5 shrink-0 ${
                  plan.webPresence === "CATALOGUE" ? "text-neutral-500" : "text-brand-700"
                }`}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-neutral-900">{presence.label}</p>
                <p className="truncate text-xs text-neutral-600">{presence.detail(slug)}</p>
              </div>
            </div>

            <ul className="mt-5 flex-1 space-y-2 text-sm text-neutral-700">
              {planFeatures(plan).map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <Check className="text-accent-600 mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  {feature}
                </li>
              ))}
            </ul>

            {renderCta ? (
              <div className="mt-6">{renderCta(plan, { isCurrent, isHighlight })}</div>
            ) : isCurrent ? (
              <span className="mt-6 inline-flex justify-center rounded-lg border border-neutral-200 px-4 py-2.5 text-sm font-medium text-neutral-500">
                You are on this plan
              </span>
            ) : (
              <Link
                href={ctaHref(plan)}
                className={`mt-6 inline-flex justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                  isHighlight
                    ? "bg-brand-700 hover:bg-brand-600 text-white"
                    : "border-brand-200 text-brand-800 hover:bg-brand-50 border"
                }`}
              >
                {ctaLabel}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
