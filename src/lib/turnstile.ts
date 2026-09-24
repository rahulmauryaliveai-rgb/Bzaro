import "server-only";
import { env } from "@/env";

/**
 * Cloudflare Turnstile verification.
 *
 * Behind the same rule as every other vendor in this codebase: plain `fetch`,
 * no SDK, one file to replace.
 *
 * ── Fails OPEN when unconfigured, CLOSED when configured ─────────────────────
 * Without TURNSTILE_SECRET this returns true, so local development and the e2e
 * suite are not gated behind a captcha. Once the secret is set, a missing or
 * rejected token fails — including when Cloudflare itself is unreachable.
 *
 * That asymmetry is deliberate. An unconfigured deployment has made no claim to
 * be protected; a configured one has, and silently letting traffic through when
 * the check errors would make the protection a decoration.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileResult = { ok: true } | { ok: false; reason: "missing" | "rejected" };

export async function verifyTurnstile(
  token: string | null | undefined,
  remoteIp?: string,
): Promise<TurnstileResult> {
  if (!env.TURNSTILE_SECRET) return { ok: true };
  if (!token) return { ok: false, reason: "missing" };

  try {
    const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token });
    if (remoteIp) body.set("remoteip", remoteIp);

    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!response.ok) {
      console.error(`[turnstile] siteverify returned ${response.status}`);
      return { ok: false, reason: "rejected" };
    }

    const result = (await response.json()) as { success?: boolean; "error-codes"?: string[] };
    if (!result.success) {
      console.warn(`[turnstile] rejected: ${(result["error-codes"] ?? []).join(", ")}`);
      return { ok: false, reason: "rejected" };
    }

    return { ok: true };
  } catch (error) {
    console.error("[turnstile] verification request failed:", error);
    return { ok: false, reason: "rejected" };
  }
}
