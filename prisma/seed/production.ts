import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { config as loadEnv } from "dotenv";
import { hash } from "@node-rs/argon2";
import { PrismaClient } from "../../src/generated/prisma/client";
import { seedPlans } from "./plans";
import { seedTemplates } from "./templates";
import { seedTaxonomy } from "./taxonomy";
import { seedSettings } from "./settings";

/**
 * Production seed — reference data only.
 *
 * The development seed (`index.ts`) creates demo sellers, leads and an admin
 * with a public password. None of that may reach a live database. This seed
 * writes only what the platform cannot run without, all of it idempotent:
 *
 *   settings   → PlatformSetting defaults
 *   plans      → Free / Basic / Gold and their web-presence tiers (D32)
 *   templates  → the storefront templates sellers choose from (D33)
 *   taxonomy   → categories and cities (D34)
 *   partitions → this month's analytics partition
 *
 * plus ONE platform administrator, from the environment:
 *
 *   ADMIN_EMAIL     required
 *   ADMIN_PASSWORD  required on first run (≥ 12 chars); ignored if the user
 *                   already exists, so re-running never resets a password
 *
 * Run with: npm run db:seed:prod   (after `npm run db:deploy`)
 */

// Same precedence Next.js and the worker use, so the seed sees what the app sees.
const nodeEnv = process.env.NODE_ENV ?? "development";
for (const file of [`.env.${nodeEnv}.local`, ".env.local", `.env.${nodeEnv}`, ".env"]) {
  loadEnv({ path: file, quiet: true });
}

const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set.");

const adminEmail = requireAdminEmail();
const adminPassword = process.env.ADMIN_PASSWORD;

function requireAdminEmail(): string {
  const value = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!value || !value.includes("@")) {
    throw new Error("ADMIN_EMAIL is required (the first platform administrator).");
  }
  return value;
}

const pool = new Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  console.log("→ platform settings");
  await seedSettings(prisma);

  console.log("→ plans");
  await seedPlans(prisma);

  console.log("→ website templates");
  await seedTemplates(prisma);

  console.log("→ categories and locations");
  await seedTaxonomy(prisma);

  console.log("→ analytics partition for the current month");
  await prisma.$executeRawUnsafe(`SELECT create_analytics_partition(CURRENT_DATE)`);

  console.log(`→ administrator ${adminEmail}`);
  const existing = await prisma.user.findUnique({
    where: { email: adminEmail },
    select: { id: true, role: true },
  });
  if (existing) {
    if (existing.role !== "SUPER_ADMIN") {
      await prisma.user.update({ where: { id: existing.id }, data: { role: "SUPER_ADMIN" } });
      console.log("   promoted existing user to SUPER_ADMIN");
    } else {
      console.log("   already present — password left unchanged");
    }
  } else {
    if (!adminPassword || adminPassword.length < 12) {
      throw new Error("ADMIN_PASSWORD (≥ 12 characters) is required to create the administrator.");
    }
    await prisma.user.create({
      data: {
        email: adminEmail,
        name: "Platform Admin",
        passwordHash: await hash(adminPassword),
        role: "SUPER_ADMIN",
        emailVerified: new Date(),
      },
    });
    console.log("   created");
  }

  console.log("\n✓ production seed complete");
}

main()
  .catch((error) => {
    console.error("\n✗ production seed failed\n", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
