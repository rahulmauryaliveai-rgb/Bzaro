import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "../../src/generated/prisma/client";
import { seedPlans } from "./plans";
import { seedTemplates } from "./templates";
import { seedTaxonomy } from "./taxonomy";
import { seedSellers } from "./sellers";
import { seedCatalog } from "./catalog";
import { seedIndexability } from "./indexability";
import { seedSettings } from "./settings";
import { seedLeadFixtures } from "./leads";

/**
 * Development seed.
 *
 * The goal is not "some data". It is a database where every branch of the
 * multi-tenant routing has a live example, so that isolation bugs surface on a
 * developer's machine rather than in staging:
 *
 *   abc-electronics   VERIFIED, fully populated  → 200, indexable
 *   sharma-steel      VERIFIED, sparse           → 200, NOT indexable (gate D2)
 *   patel-textiles    PENDING_VERIFICATION       → 404 (not public yet)
 *   kumar-tools       SUSPENDED                  → 403
 *   old-traders       soft-deleted               → 404/410
 *   verma-plastics    current slug of a renamed seller
 *   verma-plastic-industries  its OLD slug            → 308 to verma-plastics
 *
 * Run with: npm run db:seed
 */

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");
}

const pool = new Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  console.log("→ seeding platform settings");
  await seedSettings(prisma);

  console.log("→ seeding plans");
  const plans = await seedPlans(prisma);

  console.log("→ seeding website templates");
  const templates = await seedTemplates(prisma);

  console.log("→ seeding categories and locations");
  const taxonomy = await seedTaxonomy(prisma);

  console.log("→ seeding sellers and fixture tenants");
  await seedSellers(prisma, { plans, templates, taxonomy });

  console.log("→ seeding lead-matching fixtures");
  await seedLeadFixtures(prisma, { plans, templates, taxonomy });

  console.log("→ seeding catalogue");
  await seedCatalog(prisma, taxonomy);

  console.log("→ evaluating index eligibility (real D2 rules)");
  await seedIndexability(prisma);

  // The analytics table is partitioned by month. The cron job provisions
  // partitions ahead of need in production; the seed does it so a fresh clone
  // can write events immediately.
  console.log("→ ensuring analytics partitions");
  await prisma.$executeRawUnsafe(`SELECT create_analytics_partition(CURRENT_DATE)`);

  console.log("\n✓ seed complete");
  console.log("\n  Try these hosts (dev server on :3000):");
  console.log("    http://lvh.me:3000                        marketplace");
  console.log("    http://abc-electronics.lvh.me:3000        populated tenant");
  console.log("    http://sharma-steel.lvh.me:3000           sparse tenant (noindex)");
  console.log("    http://kumar-tools.lvh.me:3000            suspended → 403");
  console.log("    http://verma-plastics.lvh.me:3000         renamed seller (current slug)");
  console.log("    http://verma-plastic-industries.lvh.me:3000  old slug → 308, path preserved");
  console.log("    http://patel-textiles.lvh.me:3000         unverified → 404");
}

main()
  .catch((error) => {
    console.error("\n✗ seed failed\n", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
