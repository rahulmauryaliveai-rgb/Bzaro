import { z } from "zod";

/**
 * Public environment. Edge-safe and browser-safe.
 *
 * This file is deliberately separate from `src/env.ts`. The proxy runs on the
 * Edge runtime where server secrets (DATABASE_URL, AUTH_SECRET) are not
 * present, so importing the server schema there would throw at module load.
 * Anything the proxy or a client component needs lives here; everything secret
 * lives in `src/env.ts` and is server-only.
 *
 * Every value here is compiled into the browser bundle. Never add a secret.
 */

const clientSchema = z.object({
  /**
   * Root domain WITHOUT protocol. Includes the port in development
   * (`lvh.me:3000`), omits it in production (`bzaro.in`).
   *
   * That asymmetry is the most common source of "works locally, breaks in
   * production" in wildcard-subdomain apps. Never compare this against a raw
   * Host header — use src/lib/utils/url.ts, which normalises both sides.
   */
  NEXT_PUBLIC_ROOT_DOMAIN: z.string().min(1),
  NEXT_PUBLIC_PROTOCOL: z.enum(["http", "https"]).default("https"),
  NEXT_PUBLIC_PLATFORM_NAME: z.string().min(1).default("Bzaro"),
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: z.string().optional(),
});

/**
 * Next.js inlines `process.env.NEXT_PUBLIC_*` only for statically analysable
 * member expressions, so these must be written out literally rather than
 * iterated over.
 */
const values = {
  NEXT_PUBLIC_ROOT_DOMAIN: process.env.NEXT_PUBLIC_ROOT_DOMAIN,
  NEXT_PUBLIC_PROTOCOL: process.env.NEXT_PUBLIC_PROTOCOL,
  NEXT_PUBLIC_PLATFORM_NAME: process.env.NEXT_PUBLIC_PLATFORM_NAME,
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
};

const parsed = clientSchema.safeParse(values);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  • ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
  throw new Error(
    `Invalid public environment variables:\n${issues}\n\n` +
      `Copy .env.example to .env.local and fill in the missing values.`,
  );
}

export const clientEnv = parsed.data;
export type ClientEnv = typeof clientEnv;

/**
 * Build mode, for the Edge runtime.
 *
 * `NODE_ENV` is a build-time constant Next.js inlines, not runtime
 * configuration — so it is not part of the schema above, which exists to catch
 * missing deployment values. It is re-exported here so edge code (the proxy)
 * has one sanctioned accessor and does not have to reach for raw `process.env`,
 * which would be indistinguishable from reading real configuration unsafely.
 */
export const IS_PRODUCTION = process.env.NODE_ENV === "production";
