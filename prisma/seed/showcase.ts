import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { config as loadEnv } from "dotenv";
import { hash } from "@node-rs/argon2";
import { randomBytes, createHash } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "../../src/generated/prisma/client";
import { seedPlans } from "./plans";
import { seedTemplates } from "./templates";
import { seedTaxonomy } from "./taxonomy";
import { image, seedSellerCatalog } from "./catalog";
import { REQUIREMENTS, SHOWCASE } from "./data/showcase";
import { CATEGORY_TREE } from "./data/categories";

/**
 * Showcase seed — demo sellers for presenting the LIVE platform.
 *
 * Production has no demo data by default (`production.ts`). This adds a
 * handful of believable, fully populated sellers so every screen has
 * something on it when the platform is shown to prospective sellers:
 * six Gold-plan storefronts on different templates, categories and cities,
 * each with products, services and a gallery, plus a few open buyer
 * requirements so the lead inbox and the admin queue are not empty.
 *
 * Differences from the development seed, all deliberate:
 *   - every slug starts with `demo-` and every login is `demo-*@bzaro.in`,
 *     so the whole set can be removed in one go:  --remove
 *   - passwords are random per run and written to DEMO_CREDENTIALS_FILE
 *     (default ./demo-credentials.txt, chmod 600) — never a shared default
 *   - phone numbers are the reserved 99999-xxxxx range, so a "Call" button
 *     during a demo never rings a real person
 *   - storefronts are marked non-indexable: search engines must not learn
 *     these businesses exist
 *
 * Idempotent: re-running updates in place and does not reset passwords.
 *
 *   npm run db:seed:showcase             create / refresh
 *   npm run db:seed:showcase -- --remove  delete everything it created
 */

const nodeEnv = process.env.NODE_ENV ?? "development";
for (const file of [`.env.${nodeEnv}.local`, ".env.local", `.env.${nodeEnv}`, ".env"]) {
  loadEnv({ path: file, quiet: true });
}

const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set.");

const REMOVE = process.argv.includes("--remove");
const CREDENTIALS_FILE = process.env.DEMO_CREDENTIALS_FILE ?? "demo-credentials.txt";
const PREFIX = "demo-";
const DEMO_BUYER_PHONE = "+919999900001";

const pool = new Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

/**
 * Real photos fetched by scripts/demo-images.ts live in public/uploads/demo
 * (served by Caddy on the VPS, by Next locally). Anything not fetched falls
 * back to a picsum placeholder so the seed never breaks on a missing file.
 */
function demoImage(seed: string, w: number, h: number): string {
  const file = `${seed}.webp`;
  return existsSync(join(process.cwd(), "public", "uploads", "demo", file))
    ? `/uploads/demo/${file}`
    : image(seed, w, h);
}

/** Category tiles fetched by the same script — applied to the real Category rows. */
function categoryImage(slug: string): string | null {
  const file = `${slug}.webp`;
  return existsSync(join(process.cwd(), "public", "uploads", "categories", file))
    ? `/uploads/categories/${file}`
    : null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function password(): string {
  return randomBytes(18).toString("base64url");
}

/** Reserved-looking Indian mobile: 99999 + 5 digits, unique per index. */
function demoPhone(index: number): string {
  return `+9199999${String(10000 + index).slice(-5)}`;
}

function fingerprint(productName: string, categoryId: string): string {
  return createHash("sha256").update(`${productName.toLowerCase()}|${categoryId}`).digest("hex");
}

// ── Remove ───────────────────────────────────────────────────────────────────

async function remove() {
  const sellers = await prisma.seller.findMany({
    where: { slug: { startsWith: PREFIX } },
    select: { id: true, slug: true },
  });
  const users = await prisma.user.findMany({
    where: { email: { startsWith: PREFIX, endsWith: "@bzaro.in" } },
    select: { id: true },
  });
  const buyer = await prisma.buyer.findUnique({ where: { phone: DEMO_BUYER_PHONE } });

  // Requirements cascade to leads/deliveries; sellers cascade to their catalogue.
  if (buyer) await prisma.requirement.deleteMany({ where: { buyerId: buyer.id } });
  if (buyer) await prisma.buyer.delete({ where: { id: buyer.id } });
  for (const seller of sellers) {
    await prisma.seller.delete({ where: { id: seller.id } });
    console.log(`   removed ${seller.slug}`);
  }
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  console.log(`\n✓ removed ${sellers.length} showcase sellers, ${users.length} logins, demo buyer`);
}

// ── Create / refresh ─────────────────────────────────────────────────────────

async function create() {
  console.log("→ reference data");
  const plans = await seedPlans(prisma);
  const templates = await seedTemplates(prisma);
  const taxonomy = await seedTaxonomy(prisma);
  const gold = plans.gold;
  if (!gold) throw new Error("Gold plan missing — run db:seed:prod first.");
  const goldPlan = await prisma.plan.findUniqueOrThrow({
    where: { id: gold.id },
    select: { leadCreditsPerMonth: true, webPresence: true },
  });

  const credentials: string[] = [];
  const now = new Date();
  const periodKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  console.log("→ showcase sellers");
  for (const [index, fixture] of SHOWCASE.entries()) {
    const email = `${fixture.slug}@bzaro.in`;
    const phone = demoPhone(index + 1);
    const locationId = taxonomy.locations[fixture.city];
    const categoryId = taxonomy.categories[fixture.categorySlug];
    if (!locationId || !categoryId) {
      throw new Error(`${fixture.slug}: unknown city or category`);
    }

    // Login. Password only on first creation — re-runs never rotate it.
    let user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) {
      const plain = password();
      user = await prisma.user.create({
        data: {
          email,
          name: `${fixture.businessName} Owner`,
          passwordHash: await hash(plain),
          role: "SELLER_OWNER",
          emailVerified: now,
          phone,
          phoneVerified: now,
        },
        select: { id: true },
      });
      credentials.push(`${email}  ${plain}`);
    }

    const seller = await prisma.seller.upsert({
      where: { slug: fixture.slug },
      create: {
        slug: fixture.slug,
        businessName: fixture.businessName,
        tagline: fixture.tagline,
        description: fixture.description,
        status: "VERIFIED",
        verifiedAt: now,
        email,
        phone,
        whatsapp: phone,
        gstin: fixture.gstin,
        gstinVerifiedAt: now,
        logoUrl: null,
        coverImageUrl: demoImage(`${fixture.slug}-cover`, 1600, 600),
        addressLine1: "Plot 14, Industrial Estate",
        postalCode: "400001",
        locationId,
        establishedYear: fixture.establishedYear,
        employeeCount: fixture.employeeCount,
        businessType: fixture.businessType,
        onboardingStep: "COMPLETE",
        timezone: "Asia/Kolkata",
        productCount: 0,
        serviceCount: 0,
        socialLinks: {
          linkedin: `https://linkedin.com/company/${fixture.slug.slice(PREFIX.length)}`,
        },
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
        businessName: fixture.businessName,
        tagline: fixture.tagline,
        description: fixture.description,
        status: "VERIFIED",
        onboardingStep: "COMPLETE",
        logoUrl: null,
        coverImageUrl: demoImage(`${fixture.slug}-cover`, 1600, 600),
        deletedAt: null,
      },
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
      update: { isPrimary: true },
    });
    for (const slug of fixture.secondaryCategorySlugs ?? []) {
      const id = taxonomy.categories[slug];
      if (!id) continue;
      await prisma.sellerCategory.upsert({
        where: { sellerId_categoryId: { sellerId: seller.id, categoryId: id } },
        create: { sellerId: seller.id, categoryId: id, isPrimary: false },
        update: {},
      });
    }

    const template = templates[fixture.templateKey] ?? templates.classic!;
    await prisma.sellerWebsite.upsert({
      where: { sellerId: seller.id },
      create: {
        sellerId: seller.id,
        templateId: template.id,
        themeTokens: template.defaultTokens,
        // Never let search engines index a fictional business.
        indexable: false,
        indexBlockReason: "Showcase seller",
        publishedAt: now,
      },
      update: {
        templateId: template.id,
        themeTokens: template.defaultTokens,
        indexable: false,
        indexBlockReason: "Showcase seller",
      },
    });

    // Gold, so the subdomain site and the lead inbox are both live (D32).
    const existing = await prisma.subscription.findFirst({
      where: { sellerId: seller.id },
      select: { id: true },
    });
    if (existing) {
      await prisma.subscription.update({
        where: { id: existing.id },
        data: { planId: gold.id, status: "ACTIVE" },
      });
    } else {
      await prisma.subscription.create({
        data: {
          sellerId: seller.id,
          planId: gold.id,
          status: "ACTIVE",
          currentPeriodStart: now,
          currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 3600 * 1000),
        },
      });
    }
    await prisma.seller.update({
      where: { id: seller.id },
      data: { webPresence: goldPlan.webPresence },
    });

    const amount = goldPlan.leadCreditsPerMonth ?? 0;
    const granted = await prisma.creditLedger.findFirst({
      where: { sellerId: seller.id, reason: "MONTHLY_GRANT", periodKey },
      select: { id: true },
    });
    if (amount > 0 && !granted) {
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
            periodKey,
            note: `Monthly credits for ${periodKey}`,
          },
        });
      });
    }

    await seedSellerCatalog(prisma, taxonomy, seller.id, {
      sellerSlug: fixture.slug,
      products: fixture.products,
      services: fixture.services,
      galleryCount: fixture.galleryCount,
      resolveImage: demoImage,
    });
  }

  console.log("→ open buyer requirements");
  const buyer = await prisma.buyer.upsert({
    where: { phone: DEMO_BUYER_PHONE },
    create: {
      phone: DEMO_BUYER_PHONE,
      phoneVerifiedAt: now,
      name: "Demo Buyer",
      company: "Demo Procurement Pvt Ltd",
      locationId: taxonomy.locations["mumbai"],
    },
    update: {},
    select: { id: true },
  });
  const openCount = await prisma.requirement.count({ where: { buyerId: buyer.id } });
  if (openCount === 0) {
    for (const req of REQUIREMENTS) {
      const categoryId = taxonomy.categories[req.categorySlug];
      const locationId = taxonomy.locations[req.city];
      if (!categoryId || !locationId) continue;
      await prisma.requirement.create({
        data: {
          buyerId: buyer.id,
          categoryId,
          locationId,
          productName: req.productName,
          quantity: req.quantity,
          quantityUnit: req.quantityUnit,
          timeline: req.timeline,
          purpose: req.purpose,
          notes: req.notes,
          fingerprint: fingerprint(req.productName, categoryId),
          // PENDING: the lead worker matches sellers and creates the leads.
          fanoutStatus: "PENDING",
        },
      });
    }
    console.log(`   ${REQUIREMENTS.length} requirements queued for the lead worker`);
  } else {
    console.log(`   ${openCount} already present — skipped`);
  }

  console.log("→ category tiles");
  let tiles = 0;
  const walk = async (nodes: typeof CATEGORY_TREE) => {
    for (const node of nodes) {
      const url = categoryImage(node.slug);
      if (url) {
        await prisma.category.updateMany({ where: { slug: node.slug }, data: { imageUrl: url } });
        tiles++;
      }
      if (node.children) await walk(node.children);
    }
  };
  await walk(CATEGORY_TREE);
  console.log(`   ${tiles} categories given a photo`);

  await prisma.$executeRawUnsafe(`SELECT create_analytics_partition(CURRENT_DATE)`);

  if (credentials.length > 0) {
    const body =
      `# Bzaro showcase seller logins — generated ${now.toISOString()}\n` +
      `# Sign in at /login. Remove all showcase data with: npm run db:seed:showcase -- --remove\n\n` +
      credentials.join("\n") +
      "\n";
    writeFileSync(CREDENTIALS_FILE, body, { mode: 0o600 });
    console.log(`\n   ${credentials.length} new logins written to ${CREDENTIALS_FILE}`);
  }

  console.log("\n✓ showcase seed complete");
  for (const fixture of SHOWCASE) console.log(`   ${fixture.slug}`);
}

(REMOVE ? remove() : create())
  .catch((error) => {
    console.error("\n✗ showcase seed failed\n", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
