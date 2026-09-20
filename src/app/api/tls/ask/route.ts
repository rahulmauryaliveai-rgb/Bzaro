import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSubdomain, isRootHost } from "@/lib/utils/url";

/**
 * Caddy `on_demand_tls` gate (deploy/Caddyfile).
 *
 * On the VPS, certificates are issued per hostname the first time a host is
 * requested, via the HTTP-01 challenge — no DNS-provider API and therefore no
 * wildcard, but also nothing to configure. Before issuing, Caddy asks this
 * endpoint whether the hostname is one of ours. Answering 200 for anything
 * would let an attacker request `x1.bzaro.in`, `x2.bzaro.in`, … and exhaust
 * the ACME rate limit for the whole domain, so only the apex, `www`, and
 * subdomains belonging to a seller row (current or historical slug) qualify.
 *
 * Deliberately permissive about seller STATUS: a pending or suspended seller
 * still gets a certificate so the app can show its own 404/403 page over
 * valid TLS instead of a browser security warning. Multi-label hosts are
 * refused by getSubdomain() — a certificate would be issuable, but the app
 * never resolves them to a tenant (docs/DEPLOYMENT.md §3).
 *
 * Only reachable from Caddy on loopback; it leaks nothing but yes/no.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

const yes = () => new NextResponse(null, { status: 200 });
const no = () => new NextResponse(null, { status: 404 });

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("domain")?.trim().toLowerCase() ?? "";
  if (!raw || raw.length > 253 || !/^[a-z0-9.-]+$/.test(raw)) return no();

  if (isRootHost(raw)) return yes();

  const slug = getSubdomain(raw);
  if (!slug) return no();

  const [seller, history] = await Promise.all([
    db.seller.findUnique({ where: { slug }, select: { id: true } }),
    db.sellerSlugHistory.findUnique({ where: { slug }, select: { id: true } }),
  ]);

  return seller || history ? yes() : no();
}
