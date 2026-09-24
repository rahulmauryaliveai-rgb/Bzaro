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

/**
 * Required in production, optional (and allowed empty) elsewhere.
 *
 * `.optional()` rather than a union with `z.undefined()`: under Zod 4 only the
 * former marks the object KEY as optional — the union still fails an absent
 * variable with "expected nonoptional".
 */
const requiredInProd = (schema: z.ZodString) =>
  process.env.NODE_ENV === "production" ? schema : z.union([schema, z.literal("")]).optional();

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
  /**
   * Permit the local-disk upload provider in production.
   *
   * The local provider writes to `public/uploads`, which is only correct on a
   * host with a persistent filesystem behind a reverse proxy that serves that
   * directory — a VPS (deploy/), never a serverless platform. Set to "1" there
   * and leave unset everywhere else, so an ephemeral-filesystem deploy without
   * Cloudinary still refuses uploads rather than losing them.
   */
  MEDIA_LOCAL_UPLOADS: z
    .enum(["0", "1"])
    .optional()
    .transform((value) => value === "1"),

  // ── Transactional email ──
  // Optional everywhere: without these, src/lib/mail falls back to logging
  // messages to the server console, which is the fastest local loop for
  // copying a verification link. Production logs a loud error instead of
  // failing to boot — a platform that cannot send email is degraded, but
  // taking the whole site down over it would be worse.
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  /**
   * Cloudflare Turnstile. Optional: unset means the captcha is not enforced at
   * all (see src/lib/turnstile.ts for why it fails open only when unconfigured).
   */
  TURNSTILE_SECRET: z.string().optional(),
  /**
   * AES-256-GCM key for seller payment/shipping credentials, base64 of 32
   * bytes. Required in production only once integrations are enabled; the
   * crypto module throws a clear error if a seller tries to save without it.
   */
  INTEGRATIONS_ENCRYPTION_KEY: z.string().optional(),

  // ── Buyer OTP + lead notifications ──
  // Both providers follow the mail pattern: unset → console implementation.
  // WHATSAPP_* are read only by the Cloud API adapter (later phase).
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  /**
   * Keys OTP code hashes (HMAC) so a database dump alone cannot brute-force a
   * six-digit code offline. Rotating it invalidates in-flight challenges,
   * which expire within five minutes anyway.
   */
  OTP_PEPPER: requiredInProd(nonEmpty.min(32, "must be at least 32 characters")),
  /**
   * Fixed OTP code for automated tests. Honoured only outside production, or
   * in a production build that also sets ALLOW_INSECURE_RATE_LIMIT (D26) —
   * the one sanctioned "this deployment is a test rig" signal. Never set it
   * on a real deployment.
   */
  OTP_TEST_CODE: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),

  // ── Lead worker (src/server/worker) ──
  WORKER_POLL_MS: z.coerce.number().int().min(250).max(60_000).default(2_000),
  WORKER_EXPIRY_SWEEP_MS: z.coerce.number().int().min(10_000).max(3_600_000).default(300_000),

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
