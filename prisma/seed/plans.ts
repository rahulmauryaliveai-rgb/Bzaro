import type { PrismaClient } from "../../src/generated/prisma/client";

/**
 * Subscription plans — decision D41 (supersedes the D32 ladder).
 *
 *   free  ₹0            listing + catalogue page; direct enquiries free;
 *                       market leads as teasers, unlocked with a ₹499 pack
 *   pro   ₹999/mo  ₹9,999/yr   website on {slug}.bzaro.in, 30 credits/month,
 *                       10 leads/week + 1 lead a day; payment-gateway and
 *                       shipping add-ons bought from the dashboard
 *   gold  ₹2,999/mo ₹25,000/yr  own domain, orders + shipping included,
 *                       80 credits/month, 20 leads/week + 1 a day, trust
 *                       seal, top placement
 *
 * GST (18%) is added on top of every price. Prices are integer minor units —
 * paise, not rupees. ₹999 is 99900. Every number is data: an admin edits it
 * on /admin/plans without a deploy.
 */

export async function seedPlans(prisma: PrismaClient) {
  const definitions = [
    {
      key: "free",
      name: "Free",
      description: "A free business listing. Direct buyer enquiries on WhatsApp.",
      priceMinor: 0,
      yearlyPriceMinor: null,
      maxProducts: 10,
      maxServices: 3,
      maxGalleryItems: 6,
      maxCategories: 2,
      leadCreditsPerMonth: 0,
      weeklyLeadQuota: 5,
      dailyLeadQuota: 0,
      webPresence: "CATALOGUE" as const,
      includesPayments: false,
      includesShipping: false,
      trustSeal: false,
      allowPremiumTemplates: false,
      removeBranding: false,
      searchBoost: 0,
      sortOrder: 0,
    },
    {
      key: "pro",
      name: "Pro",
      description: "Your own website on bzaro.in and fresh buyer leads every week.",
      priceMinor: 99_900,
      yearlyPriceMinor: 999_900,
      maxProducts: 100,
      maxServices: 20,
      maxGalleryItems: 30,
      maxCategories: 5,
      leadCreditsPerMonth: 30,
      weeklyLeadQuota: 10,
      dailyLeadQuota: 1,
      webPresence: "SUBDOMAIN" as const,
      includesPayments: false,
      includesShipping: false,
      trustSeal: false,
      allowPremiumTemplates: true,
      removeBranding: false,
      searchBoost: 10,
      sortOrder: 1,
    },
    {
      key: "gold",
      name: "Gold",
      description: "Your own domain, online orders and shipping included, top placement.",
      priceMinor: 299_900,
      yearlyPriceMinor: 2_500_000,
      maxProducts: 1000,
      maxServices: 200,
      maxGalleryItems: 200,
      maxCategories: 15,
      leadCreditsPerMonth: 80,
      weeklyLeadQuota: 20,
      dailyLeadQuota: 1,
      webPresence: "CUSTOM_DOMAIN" as const,
      includesPayments: true,
      includesShipping: true,
      trustSeal: true,
      allowPremiumTemplates: true,
      removeBranding: true,
      prioritySupport: true,
      searchBoost: 50,
      sortOrder: 2,
    },
  ];

  // The middle tier was "silver" before D32 and "basic" before D41. Rename in
  // place rather than leaving two middle tiers.
  for (const legacy of ["silver", "basic"]) {
    const exists = await prisma.plan.findUnique({ where: { key: "pro" }, select: { id: true } });
    if (!exists) await prisma.plan.updateMany({ where: { key: legacy }, data: { key: "pro" } });
  }

  const plans: Record<string, { id: string }> = {};

  for (const plan of definitions) {
    const row = await prisma.plan.upsert({
      where: { key: plan.key },
      create: { ...plan, currency: "INR", interval: "MONTHLY", trialDays: 0 },
      update: plan,
      select: { id: true, key: true },
    });
    plans[row.key] = { id: row.id };
  }

  return plans;
}

export type SeededPlans = Awaited<ReturnType<typeof seedPlans>>;
