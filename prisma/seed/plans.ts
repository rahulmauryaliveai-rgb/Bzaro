import type { PrismaClient } from "../../src/generated/prisma/client";

/**
 * Subscription plans.
 *
 * Reflects decision D5(a): leads are free, plans buy visibility and capacity.
 * `leadCreditsPerMonth` stays null (unlimited) so switching to metered leads
 * later is a data change plus a feature flag, not a migration.
 *
 * Prices are integer minor units — paise, not rupees. ₹999 is 99900.
 */

export async function seedPlans(prisma: PrismaClient) {
  const definitions = [
    {
      key: "free",
      name: "Free",
      description: "Get listed and get a website.",
      priceMinor: 0,
      maxProducts: 10,
      maxServices: 3,
      maxGalleryItems: 6,
      maxCategories: 2,
      allowCustomDomain: false,
      allowPremiumTemplates: false,
      removeBranding: false,
      searchBoost: 0,
      sortOrder: 0,
    },
    {
      key: "silver",
      name: "Silver",
      description: "More catalogue, better placement.",
      priceMinor: 99_900,
      maxProducts: 100,
      maxServices: 20,
      maxGalleryItems: 30,
      maxCategories: 5,
      allowCustomDomain: false,
      allowPremiumTemplates: true,
      removeBranding: false,
      searchBoost: 10,
      sortOrder: 1,
    },
    {
      key: "gold",
      name: "Gold",
      description: "Unlimited catalogue, your own domain, no platform branding.",
      priceMinor: 299_900,
      maxProducts: 1000,
      maxServices: 200,
      maxGalleryItems: 200,
      maxCategories: 15,
      allowCustomDomain: true,
      allowPremiumTemplates: true,
      removeBranding: true,
      prioritySupport: true,
      searchBoost: 25,
      sortOrder: 2,
    },
  ];

  const plans: Record<string, { id: string }> = {};

  for (const plan of definitions) {
    const row = await prisma.plan.upsert({
      where: { key: plan.key },
      create: { ...plan, currency: "INR", interval: "MONTHLY", trialDays: 14 },
      update: plan,
      select: { id: true, key: true },
    });
    plans[row.key] = { id: row.id };
  }

  return plans;
}

export type SeededPlans = Awaited<ReturnType<typeof seedPlans>>;
