import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { createHash } from "node:crypto";
import { env } from "@/env";

/**
 * Rate limiting.
 *
 * Two layers, by design:
 *   Cloudflare WAF — blunt, at the edge, stops volumetric abuse before it costs
 *                    us a function invocation.
 *   This module    — precise, per-action, per-identity, and aware of what the
 *                    action actually costs us.
 *
 * ── Local development ────────────────────────────────────────────────────────
 * When Upstash credentials are absent the limiter falls back to an in-memory
 * implementation, so nobody needs Redis to run the app locally. The fallback is
 * per-process and therefore useless across serverless instances — it is a
 * development convenience and is never a production control. `assertConfigured`
 * makes that explicit at boot in production.
 */

const hasUpstash = Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);

/**
 * Production requires real Redis — but the check happens on first USE, not at
 * module load.
 *
 * Throwing at import time breaks `next build`, which legitimately runs with
 * NODE_ENV=production and without runtime secrets. That turned a safety guard
 * into "you cannot build the app", which is how safety guards get deleted.
 *
 * Failing here instead means a misconfigured deploy surfaces as a loud 500 on
 * the rate-limited action rather than silently running with no protection at
 * all. The in-memory fallback is per-instance and provides none across
 * serverless instances, so quietly using it in production is the one outcome
 * worth preventing.
 */
let warnedAboutInsecureLimiter = false;

function assertConfigured(): void {
  if (hasUpstash || env.NODE_ENV !== "production") return;

  // The one sanctioned exception: a production BUILD running under test, where
  // no Redis exists but the rate-limited journeys still need exercising.
  // Warned once per process so it can never pass unnoticed in a real deploy.
  if (env.ALLOW_INSECURE_RATE_LIMIT) {
    if (!warnedAboutInsecureLimiter) {
      warnedAboutInsecureLimiter = true;
      console.warn(
        "[ratelimit] ALLOW_INSECURE_RATE_LIMIT is set: using the in-memory limiter " +
          "in a production build. This protects nothing across instances and must " +
          "never be set on a real deployment.",
      );
    }
    return;
  }

  throw new Error(
    "Upstash Redis credentials are required in production. " +
      "The in-memory rate limiter is per-instance and provides no real protection. " +
      "Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
  );
}

const redis = hasUpstash
  ? new Redis({
      url: env.UPSTASH_REDIS_REST_URL!,
      token: env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;

export type LimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  /** Unix ms when the window resets. */
  reset: number;
};

/**
 * Limits, chosen by what the action costs and how much abuse hurts.
 *
 * `enquiry` is the tightest because enquiry quality IS the product: a spammed
 * inbox destroys the seller's trust in the platform faster than downtime does.
 */
const LIMITS = {
  /** Enquiry submission. Per IP. */
  enquiry: { tokens: 5, window: "1 h" },
  /** Login attempts. Per IP — the per-account lockout is separate. */
  login: { tokens: 10, window: "1 h" },
  /** Phone OTP requests. Per phone number: each one costs real money. */
  otp: { tokens: 3, window: "1 h" },
  /** Upload signature requests. Per seller. */
  upload: { tokens: 30, window: "1 h" },
  /** Search queries. Per IP — protects the database, not the business. */
  search: { tokens: 60, window: "1 m" },
  /** Registration. Per IP. */
  register: { tokens: 5, window: "1 h" },
  /** Password reset requests. Per IP. */
  passwordReset: { tokens: 5, window: "1 h" },
  /** WhatsApp click tracking. Generous: it is a normal user action. */
  whatsapp: { tokens: 60, window: "1 h" },
} as const;

export type LimitKind = keyof typeof LIMITS;

const limiters = new Map<LimitKind, Ratelimit>();

function getLimiter(kind: LimitKind): Ratelimit | null {
  if (!redis) return null;

  let limiter = limiters.get(kind);
  if (!limiter) {
    const { tokens, window } = LIMITS[kind];
    limiter = new Ratelimit({
      redis,
      // Sliding window rather than fixed: a fixed window lets an attacker send
      // 2× the limit across a window boundary.
      limiter: Ratelimit.slidingWindow(
        tokens,
        window as Parameters<typeof Ratelimit.slidingWindow>[1],
      ),
      prefix: `rl:${kind}`,
      analytics: false,
    });
    limiters.set(kind, limiter);
  }
  return limiter;
}

// ── In-memory fallback (development only) ────────────────────────────────────
const memory = new Map<string, { count: number; reset: number }>();

const WINDOW_MS: Record<string, number> = {
  "1 m": 60_000,
  "1 h": 3_600_000,
};

function memoryLimit(kind: LimitKind, identifier: string): LimitResult {
  const { tokens, window } = LIMITS[kind];
  const windowMs = WINDOW_MS[window] ?? 3_600_000;
  const key = `${kind}:${identifier}`;
  const now = Date.now();

  const entry = memory.get(key);
  if (!entry || entry.reset < now) {
    memory.set(key, { count: 1, reset: now + windowMs });
    return { success: true, limit: tokens, remaining: tokens - 1, reset: now + windowMs };
  }

  entry.count += 1;
  return {
    success: entry.count <= tokens,
    limit: tokens,
    remaining: Math.max(0, tokens - entry.count),
    reset: entry.reset,
  };
}

/**
 * Consume one token.
 *
 * Fails OPEN on infrastructure error: if Redis is unreachable, a functioning
 * marketplace with no rate limiting beats a marketplace that rejects every
 * enquiry. The tradeoff is deliberate, and monitored — a spike in these errors
 * should page someone.
 */
export async function checkRateLimit(kind: LimitKind, identifier: string): Promise<LimitResult> {
  assertConfigured();

  const limiter = getLimiter(kind);
  if (!limiter) return memoryLimit(kind, identifier);

  try {
    const result = await limiter.limit(identifier);
    return {
      success: result.success,
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
    };
  } catch {
    const { tokens } = LIMITS[kind];
    return { success: true, limit: tokens, remaining: tokens, reset: Date.now() };
  }
}

/**
 * Hash an IP address before it is used as a rate-limit key or stored.
 *
 * Raw IPs are personal data under GDPR and India's DPDP Act. Salting means the
 * stored value cannot be reversed to an address by anyone who obtains the
 * database, and rotating the salt quarterly bounds how long any correlation
 * remains possible.
 */
export function hashIp(ip: string): string {
  return createHash("sha256").update(`${env.IP_HASH_SALT}:${ip}`).digest("hex").slice(0, 32);
}

/**
 * Best-effort client IP from proxy headers.
 *
 * Only trustworthy behind a proxy that overwrites these headers — Cloudflare
 * and Vercel both do. Direct-to-origin traffic can forge them, which is one
 * more reason the origin must not be publicly reachable in production.
 */
export function getClientIp(headers: Headers): string {
  const cf = headers.get("cf-connecting-ip");
  if (cf) return cf;

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();

  return headers.get("x-real-ip") ?? "0.0.0.0";
}

export { LIMITS };
