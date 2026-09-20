import { hash } from "@node-rs/argon2";
import type { PrismaClient } from "../../src/generated/prisma/client";
import type { SellerStatus } from "../../src/generated/prisma/enums";
import type { SeededPlans } from "./plans";
import type { SeededTemplates } from "./templates";
import type { SeededTaxonomy } from "./taxonomy";

/**
 * Fixture tenants.
 *
 * Each one exists to exercise a specific branch of tenant resolution. Together
 * they mean the isolation tests in tests/e2e run against real data covering
 * every status a hostname can resolve to — which is why a routing regression
 * shows up locally instead of in staging.
 */

const DEV_PASSWORD = "devpassword123";

type Deps = {
  plans: SeededPlans;
  templates: SeededTemplates;
  taxonomy: SeededTaxonomy;
};

type Fixture = {
  slug: string;
  businessName: string;
  status: SellerStatus;
  email: string;
  templateKey: string;
  city: string;
  categorySlug: string;
  tagline?: string;
  description?: string;
  indexable: boolean;
  /** Owner phone verified — required by the real D2 rules. */
  phoneVerified?: boolean;
  /** Branding. The D2 gate requires a logo OR a cover image. */
  branded?: boolean;
  softDeleted?: boolean;
  previousSlug?: string;
  note: string;
};

const FIXTURES: Fixture[] = [
  {
    slug: "abc-electronics",
    businessName: "ABC Electronics",
    status: "VERIFIED",
    email: "owner@abc-electronics.test",
    templateKey: "electro",
    city: "mumbai",
    categorySlug: "led-bulbs",
    tagline: "LED lighting manufacturer since 2009",
    description:
      "ABC Electronics manufactures and supplies commercial LED lighting across India. " +
      "Our range covers panel lights, street lighting and industrial high-bay fixtures, " +
      "all manufactured in our Mumbai facility and tested to IS 16101 standards. " +
      "We supply to contractors, distributors and government projects.",
    indexable: true,
    phoneVerified: true,
    branded: true,
    note: "fully populated → 200, indexable",
  },
  {
    slug: "sharma-steel",
    businessName: "Sharma Steel Traders",
    status: "VERIFIED",
    email: "owner@sharma-steel.test",
    templateKey: "autoparts",
    city: "pune",
    categorySlug: "tmt-bars",
    tagline: "Steel supplier",
    // Deliberately under the 150-character description threshold and below the
    // product minimum, so this tenant FAILS the D2 indexability gate.
    description: "We supply steel.",
    indexable: false,
    note: "sparse → 200 but noindex (gate D2)",
  },
  {
    slug: "patel-textiles",
    businessName: "Patel Textiles",
    status: "PENDING_VERIFICATION",
    email: "owner@patel-textiles.test",
    templateKey: "boutique",
    city: "surat",
    categorySlug: "cotton-fabric",
    description: "Cotton fabric wholesaler based in Surat, supplying mills across Gujarat.",
    indexable: false,
    note: "unverified → 404 (not public yet)",
  },
  {
    slug: "kumar-tools",
    businessName: "Kumar Tools & Hardware",
    status: "SUSPENDED",
    email: "owner@kumar-tools.test",
    templateKey: "classic",
    city: "new-delhi",
    categorySlug: "hand-tools",
    description: "Hand and power tool distributor.",
    indexable: false,
    note: "suspended → 403",
  },
  {
    slug: "old-traders",
    businessName: "Old Traders Pvt Ltd",
    status: "VERIFIED",
    email: "owner@old-traders.test",
    templateKey: "classic",
    city: "chennai",
    categorySlug: "steel-pipes",
    description: "Closed business, retained for soft-delete testing.",
    indexable: false,
    softDeleted: true,
    note: "soft-deleted → 404",
  },
  {
    slug: "verma-plastics",
    businessName: "Verma Plastics",
    status: "VERIFIED",
    email: "owner@verma-plastics.test",
    templateKey: "minimal",
    city: "ahmedabad",
    categorySlug: "industrial-textiles",
    description:
      "Verma Plastics produces industrial packaging film and moulded components for the " +
      "chemical and pharmaceutical sectors, operating two extrusion lines in Ahmedabad.",
    indexable: true,
    phoneVerified: true,
    branded: true,
    previousSlug: "verma-plastic-industries",
    note: "renamed → old slug 301s to new",
  },
];

export async function seedSellers(prisma: PrismaClient, deps: Deps) {
  const passwordHash = await hash(DEV_PASSWORD);

  // Platform staff, for exercising the admin surface.
  await prisma.user.upsert({
    where: { email: "admin@bzaro.test" },
    create: {
      email: "admin@bzaro.test",
      name: "Platform Admin",
      passwordHash,
      role: "SUPER_ADMIN",
      emailVerified: new Date(),
    },
    update: { role: "SUPER_ADMIN" },
  });

  for (const fixture of FIXTURES) {
    const user = await prisma.user.upsert({
      where: { email: fixture.email },
      create: {
        email: fixture.email,
        name: `${fixture.businessName} Owner`,
        passwordHash,
        role: "SELLER_OWNER",
        emailVerified: new Date(),
        phone: randomPhone(),
        phoneVerified: fixture.phoneVerified ? new Date() : null,
      },
      update: { phoneVerified: fixture.phoneVerified ? new Date() : null },
      select: { id: true },
    });

    const locationId = deps.taxonomy.locations[fixture.city];
    const categoryId = deps.taxonomy.categories[fixture.categorySlug];

    const seller = await prisma.seller.upsert({
      where: { slug: fixture.slug },
      create: {
        slug: fixture.slug,
        businessName: fixture.businessName,
        tagline: fixture.tagline,
        description: fixture.description,
        status: fixture.status,
        email: fixture.email,
        phone: randomPhone(),
        whatsapp: randomPhone(),
        logoUrl: fixture.branded ? `https://picsum.photos/seed/${fixture.slug}-logo/200/200` : null,
        coverImageUrl: fixture.branded
          ? `https://picsum.photos/seed/${fixture.slug}-cover/1600/600`
          : null,
        addressLine1: "Plot 14, Industrial Estate",
        postalCode: "400001",
        locationId,
        establishedYear: 2009,
        employeeCount: "11-50",
        businessType: "MANUFACTURER",
        // Fixtures are fully onboarded; the multi-step flow is for new sellers.
        onboardingStep: "COMPLETE",
        timezone: "Asia/Kolkata",
        // Counters are derived from real rows: seedCatalog reconciles them,
        // and sellers with no catalogue genuinely have zero. Seeding a
        // fictional number here would make refresh-counters report a
        // correction on every run, masking real drift.
        productCount: 0,
        serviceCount: 0,
        verifiedAt: fixture.status === "VERIFIED" ? new Date() : null,
        deletedAt: fixture.softDeleted ? new Date() : null,
        socialLinks: { linkedin: `https://linkedin.com/company/${fixture.slug}` },
        businessHours: {
          mon: [{ open: "09:30", close: "18:30" }],
          tue: [{ open: "09:30", close: "18:30" }],
          wed: [{ open: "09:30", close: "18:30" }],
          thu: [{ open: "09:30", close: "18:30" }],
          fri: [{ open: "09:30", close: "18:30" }],
          sat: [{ open: "10:00", close: "14:00" }],
        },
      },
      update: {
        status: fixture.status,
        description: fixture.description,
        onboardingStep: "COMPLETE",
        productCount: 0,
        serviceCount: 0,
        logoUrl: fixture.branded ? `https://picsum.photos/seed/${fixture.slug}-logo/200/200` : null,
        coverImageUrl: fixture.branded
          ? `https://picsum.photos/seed/${fixture.slug}-cover/1600/600`
          : null,
        deletedAt: fixture.softDeleted ? new Date() : null,
      },
      select: { id: true },
    });

    await prisma.sellerMember.upsert({
      where: { userId_sellerId: { userId: user.id, sellerId: seller.id } },
      create: { userId: user.id, sellerId: seller.id, role: "SELLER_OWNER" },
      update: {},
    });

    if (categoryId) {
      await prisma.sellerCategory.upsert({
        where: { sellerId_categoryId: { sellerId: seller.id, categoryId } },
        create: { sellerId: seller.id, categoryId, isPrimary: true },
        update: {},
      });
    }

    const template = deps.templates[fixture.templateKey] ?? deps.templates.classic!;
    const templateId = template.id;

    await prisma.sellerWebsite.upsert({
      where: { sellerId: seller.id },
      create: {
        sellerId: seller.id,
        templateId,
        themeTokens: template.defaultTokens,
        indexable: fixture.indexable,
        indexBlockReason: fixture.indexable ? null : "Profile incomplete (seed fixture)",
        publishedAt: fixture.status === "VERIFIED" ? new Date() : null,
      },
      update: {
        templateId,
        // Re-seeding applies the template's preset (D33) so fixture sites
        // always demo their template's intended look.
        themeTokens: template.defaultTokens,
        indexable: fixture.indexable,
        indexBlockReason: fixture.indexable ? null : "Profile incomplete (seed fixture)",
      },
    });

    // Retired slug — proves the 301 path preserves inbound links (decision D11).
    if (fixture.previousSlug) {
      await prisma.sellerSlugHistory.upsert({
        where: { slug: fixture.previousSlug },
        create: { slug: fixture.previousSlug, sellerId: seller.id },
        update: {},
      });
    }

    // Every microsite fixture sits on Gold: decision D32 made the subdomain a
    // paid tier, and these sellers exist to exercise the microsite. The
    // catalogue-tier case is covered by the lead fixtures (delhi-led-house).
    const existing = await prisma.subscription.findFirst({
      where: { sellerId: seller.id },
      select: { id: true },
    });

    const now = new Date();
    if (existing) {
      await prisma.subscription.update({
        where: { id: existing.id },
        data: { planId: deps.plans.gold!.id, status: "ACTIVE" },
      });
    } else {
      await prisma.subscription.create({
        data: {
          sellerId: seller.id,
          planId: deps.plans.gold!.id,
          status: "ACTIVE",
          currentPeriodStart: now,
          currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 3600 * 1000),
        },
      });
    }
    await prisma.seller.update({ where: { id: seller.id }, data: { webPresence: "SUBDOMAIN" } });

    console.log(`   ${fixture.slug.padEnd(18)} ${fixture.note}`);
  }

  console.log(`\n   All seeded accounts use password: ${DEV_PASSWORD}`);
}

/** Deterministic-looking Indian mobile numbers in E.164, for wa.me links. */
function randomPhone(): string {
  const n = Math.floor(1_000_0000 + Math.random() * 8_999_9999);
  return `+9198${String(n).slice(0, 8)}`;
}
