import type { PrismaClient } from "../../src/generated/prisma/client";

/**
 * Subscription plans.
 *
 * Decision D5 as revised by D28: DIRECT leads stay free and unmetered on every
 * plan; MARKET leads cost one credit to accept, and `leadCreditsPerMonth` is
 * the monthly grant (Free 0, Basic 10, Gold 40). The number is data, so
 * changing it is an admin edit rather than a deploy.
 *
 * Decision D32 — web presence is a plan tier:
 *   free   CATALOGUE   listing + catalogue page on the apex
 *   basic  CATALOGUE   more catalogue and credits, still no website
 *   gold   SUBDOMAIN   a website at {slug}.bzaro.in
 *   (pro   CUSTOM_DOMAIN — not seeded; create it from admin when D3 ships)
 *
 * Prices are integer minor units — paise, not rupees. ₹999 is 99900.
 */

export async function seedPlans(prisma: PrismaClient) {
  const definitions = [
    {
      key: "free",
      name: "Free",
      description: "Get listed with a catalogue page on Bzaro.",
      priceMinor: 0,
      maxProducts: 10,
      maxServices: 3,
      maxGalleryItems: 6,
      maxCategories: 2,
      leadCreditsPerMonth: 0,
      webPresence: "CATALOGUE" as const,
      allowPremiumTemplates: false,
      removeBranding: false,
      searchBoost: 0,
      sortOrder: 0,
    },
    {
      key: "basic",
      name: "Basic",
      description: "More catalogue, buyer requirements, better placement.",
      priceMinor: 99_900,
      maxProducts: 100,
      maxServices: 20,
      maxGalleryItems: 30,
      maxCategories: 5,
      leadCreditsPerMonth: 10,
      webPresence: "CATALOGUE" as const,
      allowPremiumTemplates: true,
      removeBranding: false,
      searchBoost: 10,
      sortOrder: 1,
    },
    {
      key: "gold",
      name: "Gold",
      description: "Your own website, unlimited catalogue, no platform branding.",
      priceMinor: 299_900,
      maxProducts: 1000,
      maxServices: 200,
      maxGalleryItems: 200,
      maxCategories: 15,
      leadCreditsPerMonth: 40,
      webPresence: "SUBDOMAIN" as const,
      allowPremiumTemplates: true,
      removeBranding: true,
      prioritySupport: true,
      searchBoost: 25,
      sortOrder: 2,
    },
  ];

  // The middle tier was called "silver" before D32. A database seeded then
  // has the old key; rename in place rather than leaving two middle tiers.
  await prisma.plan.updateMany({ where: { key: "silver" }, data: { key: "basic", name: "Basic" } });

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
