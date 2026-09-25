import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "../../src/generated/prisma/client";
import { seedPincodes } from "./pincodes";

/**
 * Seed ONLY the PIN-code table (all India, NCR hand-checked) — safe to run on production.
 *
 *   npm run db:seed:pincodes
 *
 * Every row is an upsert keyed on `pincode`, so running it twice changes
 * nothing, and it touches no other table: no demo sellers, no fixtures. Never
 * use `npm run db:seed` on production — that is the development seed.
 */

const nodeEnv = process.env.NODE_ENV ?? "development";
for (const file of [`.env.${nodeEnv}.local`, ".env.local", `.env.${nodeEnv}`, ".env"]) {
  loadEnv({ path: file, quiet: true });
}

const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set.");

const pool = new Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

seedPincodes(prisma)
  .then((count) => console.log(`✓ ${count} PIN codes upserted`))
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
