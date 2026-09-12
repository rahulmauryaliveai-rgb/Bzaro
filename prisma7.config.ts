import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Next.js loads `.env.local` ahead of `.env`; the Prisma CLI does not, so we
// mirror that precedence here. dotenv never overwrites an already-set variable,
// so loading `.env.local` first makes it win — and real CI/production
// environment variables beat both.
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

/**
 * Prisma CLI configuration (migrations, introspection, seeding).
 *
 * IMPORTANT — pooled vs. direct connections:
 * Prisma 7 removed `directUrl` from the datasource block. Migrations must NOT run
 * through PgBouncer in transaction mode (they need session-level state such as
 * advisory locks), so the CLI is pointed at DIRECT_DATABASE_URL here, while the
 * application runtime uses the pooled DATABASE_URL in `src/lib/db.ts`.
 *
 * See docs/DEPLOYMENT.md §Database.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed/index.ts",
  },
  datasource: {
    // CLI-only. Falls back to DATABASE_URL for local dev where there is no pooler.
    url: process.env["DIRECT_DATABASE_URL"] ?? process.env["DATABASE_URL"],
  },
});
