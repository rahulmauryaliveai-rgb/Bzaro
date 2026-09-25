import "server-only";
import { redirect } from "next/navigation";
import { getSessionUser, type SessionUser } from "@/lib/auth/guards";

/**
 * Require a signed-in user on a buyer account page. Unlike `requireUser`,
 * sends guests to the BUYER sign-in (/account/signin), not the seller login.
 */
export async function requireBuyerPage(returnTo: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/account/signin?next=${encodeURIComponent(returnTo)}`);
  return user;
}

/** Only same-site relative paths survive; anything else falls back. */
export function safeNextPath(next: string | undefined, fallback = "/account"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}
