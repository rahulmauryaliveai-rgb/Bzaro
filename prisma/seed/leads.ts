import { hash } from "@node-rs/argon2";
import type { PrismaClient } from "../../src/generated/prisma/client";
import type { SeededPlans } from "./plans";
import type { SeededTemplates } from "./templates";
import type { SeededTaxonomy } from "./taxonomy";

/**
 * Lead-system fixtures (docs/LEADS.md).
 *
 * The base fixtures cover tenant routing; these cover MATCHING. A requirement
 * for LED bulbs from a Mumbai buyer must find sellers across every scoring
 * tier — same city, NCR cluster, "serves Mumbai", and none — on every plan,
 * so the worker has something to rank and the inbox has something to show,
 * including the blurred free-plan teaser.
 *
 *   abc-electronics    Mumbai      gold     (the direct seller in most demos; keeps its microsite)
 *   pune-lighting      Pune        gold     serves Mumbai
 *   delhi-led-house    New Delhi   basic    (catalogue tier — no subdomain, D32)
 *   noida-lights       Noida       free     → sees the teaser, cannot accept
 *
 * Paid sellers receive this month's credit grant so "Accept" works right after
 * seeding, the same way the cron would have granted it on the 1st.
 */

const DEV_PASSWORD = "devpassword123";

type Deps = {
  plans: SeededPlans;
  templates: SeededTemplates;
  taxonomy: SeededTaxonomy;
};

type LeadFixture = {
  slug: string;
  businessName: string;
  email: string;
  city: string;
  planKey: "free" | "basic" | "gold";
  categorySlug: string;
  servesCities?: string[];
  phone: string;
};

const FIXTURES: LeadFixture[] = [
  {
    slug: "pune-lighting",
    businessName: "Pune Lighting Co",
    email: "owner@pune-lighting.test",
    city: "pune",
    planKey: "gold",
    categorySlug: "led-bulbs",
    servesCities: ["mumbai", "nagpur"],
    phone: "+919811100001",
  },
  {
    slug: "delhi-led-house",
    businessName: "Delhi LED House",
    email: "owner@delhi-led-house.test",
    city: "new-delhi",
    planKey: "basic",
    categorySlug: "led-bulbs",
    phone: "+919811100002",
  },
  {
    slug: "noida-lights",
    businessName: "Noida Lights & Fixtures",
    email: "owner@noida-lights.test",
    city: "noida",
    planKey: "free",
    categorySlug: "lighting",
    phone: "+919811100003",
  },
];

export async function seedLeadFixtures(prisma: PrismaClient, deps: Deps) {
  const passwordHash = await hash(DEV_PASSWORD);
  const periodKey = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`;

  // The routing fixture becomes a paying seller so its inbox can accept.
  await setPlan(prisma, deps, "abc-electronics", "gold", periodKey);

  for (const fixture of FIXTURES) {
    const user = await prisma.user.upsert({
      where: { email: fixture.email },
      create: {
        email: fixture.email,
        name: `${fixture.businessName} Owner`,
        passwordHash,
        role: "SELLER_OWNER",
        emailVerified: new Date(),
        phone: fixture.phone,
        phoneVerified: new Date(),
      },
      update: {},
      select: { id: true },
    });

    const locationId = deps.taxonomy.locations[fixture.city];
    const categoryId = deps.taxonomy.categories[fixture.categorySlug];
    if (!locationId || !categoryId) {
      throw new Error(`lead fixture ${fixture.slug}: unknown city or category`);
    }

    const seller = await prisma.seller.upsert({
      where: { slug: fixture.slug },
      create: {
        slug: fixture.slug,
        businessName: fixture.businessName,
        tagline: "LED and commercial lighting supplier",
        status: "VERIFIED",
        email: fixture.email,
        phone: fixture.phone,
        whatsapp: fixture.phone,
        logoUrl: `https://picsum.photos/seed/${fixture.slug}-logo/200/200`,
        addressLine1: "Unit 3, Lighting Market",
        locationId,
        establishedYear: 2015,
        employeeCount: "11-50",
        businessType: "WHOLESALER",
        onboardingStep: "COMPLETE",
        verifiedAt: new Date(),
      },
      update: { status: "VERIFIED", locationId, deletedAt: null },
      select: { id: true },
    });

    await prisma.sellerMember.upsert({
      where: { userId_sellerId: { userId: user.id, sellerId: seller.id } },
      create: { userId: user.id, sellerId: seller.id, role: "SELLER_OWNER" },
      update: {},
    });

    await prisma.sellerCategory.upsert({
      where: { sellerId_categoryId: { sellerId: seller.id, categoryId } },
      create: { sellerId: seller.id, categoryId, isPrimary: true },
      update: {},
    });

    for (const citySlug of fixture.servesCities ?? []) {
      const cityId = deps.taxonomy.locations[citySlug];
      if (!cityId) continue;
      await prisma.sellerServiceArea.upsert({
        where: { sellerId_locationId: { sellerId: seller.id, locationId: cityId } },
        create: { sellerId: seller.id, locationId: cityId },
        update: {},
      });
    }

    await prisma.sellerWebsite.upsert({
      where: { sellerId: seller.id },
      create: {
        sellerId: seller.id,
        templateId: deps.templates.medico!.id,
        themeTokens: deps.templates.medico!.defaultTokens,
        indexable: false,
        indexBlockReason: "Profile incomplete (seed fixture)",
        publishedAt: new Date(),
      },
      update: {},
    });

    await setPlan(prisma, deps, fixture.slug, fixture.planKey, periodKey);

    console.log(`   ${fixture.slug.padEnd(18)} ${fixture.city}, ${fixture.planKey}`);
  }
}

/** Put a seller on a plan and, if it carries credits, grant this month's. */
async function setPlan(
  prisma: PrismaClient,
  deps: Deps,
  slug: string,
  planKey: "free" | "basic" | "gold",
  periodKey: string,
) {
  const seller = await prisma.seller.findUnique({ where: { slug }, select: { id: true } });
  const planId = deps.plans[planKey]?.id;
  if (!seller || !planId) return;

  const plan = await prisma.plan.findUniqueOrThrow({
    where: { id: planId },
    select: { leadCreditsPerMonth: true, webPresence: true },
  });

  const existing = await prisma.subscription.findFirst({
    where: { sellerId: seller.id },
    select: { id: true },
  });
  const now = new Date();
  const subscription = existing
    ? await prisma.subscription.update({
        where: { id: existing.id },
        data: { planId, status: "ACTIVE" },
        select: { id: true },
      })
    : await prisma.subscription.create({
        data: {
          sellerId: seller.id,
          planId,
          status: "ACTIVE",
          currentPeriodStart: now,
          currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 3600 * 1000),
        },
        select: { id: true },
      });

  // D32: the denormalised tier follows the plan (what recomputeWebPresence does).
  await prisma.seller.update({ where: { id: seller.id }, data: { webPresence: plan.webPresence } });

  const amount = plan.leadCreditsPerMonth ?? 0;
  if (amount <= 0) return;

  const granted = await prisma.creditLedger.findFirst({
    where: { sellerId: seller.id, reason: "MONTHLY_GRANT", periodKey },
    select: { id: true },
  });
  if (granted) return;

  await prisma.$transaction(async (tx) => {
    const updated = await tx.seller.update({
      where: { id: seller.id },
      data: { creditBalance: { increment: amount } },
      select: { creditBalance: true },
    });
    await tx.creditLedger.create({
      data: {
        sellerId: seller.id,
        delta: amount,
        balanceAfter: updated.creditBalance,
        reason: "MONTHLY_GRANT",
        subscriptionId: subscription.id,
        periodKey,
      },
    });
  });
}
