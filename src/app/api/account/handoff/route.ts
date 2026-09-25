import { NextResponse, type NextRequest } from "next/server";
import { isSecureOrigin } from "@/lib/auth/config";
import { safeNextPath } from "@/lib/buyer/guard";
import { redeemStoreHandoff } from "@/server/services/handoff.service";
import { getSubdomain, normalizeHost, PROTOCOL } from "@/lib/utils/url";

/**
 * Store side of the sign-in hand-off (see handoff.service.ts). Runs on the
 * seller's subdomain: sets that host's session cookie, then returns the buyer
 * to the page they started from. Any failure lands them back there signed out.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rawHost = request.headers.get("host");
  const host = normalizeHost(rawHost);
  const hostWithPort = (rawHost ?? "").toLowerCase();
  const to = safeNextPath(request.nextUrl.searchParams.get("to") ?? undefined, "/");

  if (!host || !getSubdomain(host)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const back = new URL(to, `${PROTOCOL}://${hostWithPort}`);
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const result = await redeemStoreHandoff(token, hostWithPort);

  const response = NextResponse.redirect(back, 303);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  if (!result.ok) {
    console.warn(`[handoff] refused on ${host}: ${result.reason}`);
    return response;
  }

  response.cookies.set(result.cookie.name, result.cookie.value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: isSecureOrigin,
    maxAge: result.cookie.maxAge,
    // No `domain`: host-only, this store and nothing else.
  });
  return response;
}
