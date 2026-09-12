import { defineConfig } from "@playwright/test";

/**
 * Playwright configuration for the tenant-isolation suite.
 *
 * ── No browser required ──────────────────────────────────────────────────────
 * These tests assert on HTTP status codes, headers and response bodies, all via
 * Playwright's `request` fixture, which uses Node's HTTP stack directly. That is
 * deliberate, not a limitation:
 *
 *   - Isolation is a property of the SERVER's response to a hostname. Rendering
 *     it in a browser first would only add flake between the bug and the
 *     assertion.
 *   - The suite runs in seconds and needs no browser download, so it is
 *     realistic to gate every commit on it.
 *
 * Browser-driven tests arrive with the seller dashboard in Phase 3, where the
 * thing under test genuinely is the UI.
 *
 * ── Requires a running dev server and a seeded database ──────────────────────
 *   npm run db:start && npm run db:deploy && npm run db:seed
 *   npm run test:e2e
 */

const PORT = Number(process.env.PORT ?? 3000);
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? `lvh.me:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,

  /**
   * One worker.
   *
   * Playwright defaults to half the CPU cores locally and one in CI, so this
   * only changes local runs — and makes them match CI.
   *
   * The reason is the development database. `prisma dev` is PGlite, Postgres
   * embedded in a single Node process (D24), and the concurrency of several
   * workers hammering one server reliably killed it part-way through a run.
   * That surfaced as one or two unrelated-looking failures per run, every run,
   * traced every time to `ConnectionClosed` rather than to the code under test.
   *
   * Serially the same suite passes end to end. The cost is roughly twenty
   * seconds; the benefit is that a red run means something again.
   *
   * Raise this once the local database is Postgres in Docker rather than
   * PGlite — the suite itself has no shared-state reason to run serially.
   */
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: `http://${ROOT_DOMAIN}`,
    // Tenant sites are anonymous by design; never carry credentials into them.
    extraHTTPHeaders: {},
    ignoreHTTPSErrors: true,
  },

  /**
   * Runs against a PRODUCTION build, not the dev server.
   *
   * This is not pedantry. Security-relevant response headers genuinely differ
   * between the two: in development Next.js emits
   * `Cache-Control: no-cache, must-revalidate` for dynamic routes, while in
   * production the proxy's `private, no-store, max-age=0` survives. Asserting
   * against `next dev` would prove nothing about what actually ships — and the
   * assertion that matters here is that no shared cache may store a seller's
   * dashboard.
   *
   * Set PW_DEV=1 for fast iteration against `next dev`, accepting that the
   * header assertions will not reflect production.
   */
  webServer: {
    command: process.env.PW_DEV ? "npm run dev" : "npm run build && npm run start",
    url: `http://${ROOT_DOMAIN}`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      // The suite deliberately runs against a production build, where the rate
      // limiter refuses the in-memory fallback and throws. Without this every
      // rate-limited action 500s and the registration journey cannot be tested
      // at all. Scoped to the test server only — see src/env.ts.
      ALLOW_INSECURE_RATE_LIMIT: "1",
    },
  },
});
