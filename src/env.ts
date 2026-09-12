import "server-only";
import { z } from "zod";
import { clientEnv } from "@/env.client";

/**
 * Server environment, including secrets.
 *
 * Import this ONLY from server code. The `server-only` import above turns any
 * accidental client import into a build error rather than a leaked secret.
 *
 * Public values live in `src/env.client.ts` and are re-exported here for
 * convenience, so server code has one place to read configuration from.
 *
 * Every variable is validated at module load: a missing or malformed value
 * fails the build in CI and fails boot in production, instead of surfacing as
 * `undefined` inside a request handler weeks later.
 */

const nonEmpty = z.string().min(1);

/** Required in production, optional (and allowed empty) elsewhere. */
const requiredInProd = (schema: z.ZodString) =>
  process.env.NODE_ENV === "production" ? schema : z.union([schema, z.literal(""), z.undefined()]);

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // ── Database ──
  // DATABASE_URL is pooled (PgBouncer, transaction mode) and used by the app.
  // DIRECT_DATABASE_URL bypasses the pooler and is used by `prisma migrate`
  // only — migrations need session-level state the pooler will not preserve.
  DATABASE_URL: nonEmpty,
  DIRECT_DATABASE_URL: z.string().optional(),

  // ── Auth.js v5 ──
  AUTH_SECRET: requiredInProd(nonEmpty.min(32, "must be at least 32 characters")),
  AUTH_URL: z.string().optional(),
  AUTH_TRUST_HOST: z.string().optional(),
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),

  // ── Rate limiting ──
  // Optional by design: when absent, src/lib/ratelimit.ts falls back to an
  // in-memory limiter so local development needs no Redis instance.
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  /**
   * Permit the in-memory rate limiter under NODE_ENV=production.
   *
   * Exists for one case: running a PRODUCTION BUILD locally or in CI, where
   * there is no Redis but the rate-limited flows still have to be exercisable.
   * The e2e suite runs against `next start`, so without this every rate-limited
   * action 500s and those journeys cannot be tested at all.
   *
   * Named to be impossible to set by accident or to mistake for a tuning knob.
   * Never set it on a real deployment: the in-memory limiter is per-instance
   * and provides no protection across instances.
   */
  ALLOW_INSECURE_RATE_LIMIT: z
    .enum(["0", "1"])
    .optional()
    .transform((value) => value === "1"),

  // ── Media ──
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  // ── Transactional email ──
  // Optional everywhere: without these, src/lib/mail falls back to logging
  // messages to the server console, which is the fastest local loop for
  // copying a verification link. Production logs a loud error instead of
  // failing to boot — a platform that cannot send email is degraded, but
  // taking the whole site down over it would be worse.
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().optional(),

  // ── Internal ──
  /** Shared secret guarding /api/revalidate and cron handlers. */
  REVALIDATE_SECRET: requiredInProd(nonEmpty),
  /**
   * Set automatically by Vercel when a project has cron jobs, and sent as
   * `Authorization: Bearer <CRON_SECRET>`. Optional because the platform may
   * not be Vercel — `/api/cron/[job]` also accepts REVALIDATE_SECRET.
   */
  CRON_SECRET: z.string().optional(),
  /** Salt for hashing visitor IPs before storage. Rotate quarterly. */
  IP_HASH_SALT: requiredInProd(nonEmpty),
});

const parsed = serverSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  • ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
  throw new Error(
    `Invalid server environment variables:\n${issues}\n\n` +
      `Copy .env.example to .env.local and fill in the missing values.`,
  );
}

export const env = { ...parsed.data, ...clientEnv };
export type Env = typeof env;

export { clientEnv };
