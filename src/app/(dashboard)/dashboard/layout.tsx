import type { Metadata } from "next";
import { BrandLogo } from "@/components/shared/BrandLogo";
import { IBM_Plex_Sans } from "next/font/google";
import { requireSeller, scopeSurface } from "@/lib/auth/guards";
import { sellerSiteUrl } from "@/lib/utils/url";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { SignOutButton } from "@/components/shared/SignOutButton";
import "../../globals.css";
import { DemoBanner } from "@/components/shared/DemoBanner";
import Link from "next/link";
import { Crown } from "lucide-react";
import { getActivePlan } from "@/server/services/plan.service";

/**
 * Seller dashboard shell.
 *
 * ── Why this lives on the apex, not app.bzaro.in ──────────────────────
 * The session cookie is host-only. A cookie scoped to `.bzaro.in` would
 * be sent to every tenant subdomain, so one stored-XSS on one seller's product
 * description would expose the platform session of any logged-in visitor
 * browsing that tenant. Keeping the dashboard at bzaro.in/dashboard means
 * the cookie never leaves the apex.
 *
 * ── This guard is UX, not security ───────────────────────────────────────────
 * `requireSeller()` here stops a logged-out visitor seeing a broken shell. It
 * does NOT protect the Server Actions these pages call — those are POST
 * endpoints reachable directly, and each one authorises itself independently.
 * See src/lib/auth/guards.ts.
 */

const sans = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const scope = await requireSeller();
  const subscription = await getActivePlan(scope.sellerId);
  const plan = subscription?.plan;

  return (
    <html lang="en" className={`${sans.variable} h-full antialiased`}>
      <body className="min-h-full bg-neutral-50 text-neutral-900">
        <DemoBanner />
        <div className="mx-auto flex max-w-7xl gap-8 px-4 py-8">
          <aside className="w-56 shrink-0">
            <div className="mb-6">
              <BrandLogo height={30} />
            </div>
            <div className="mb-6">
              <p className="text-xs tracking-wide text-neutral-500 uppercase">Signed in as</p>
              <p className="truncate font-medium">{scope.sellerSlug}</p>
              {plan?.trustSeal ? (
                <Link
                  href="/dashboard/billing"
                  className="mt-1 inline-flex items-center gap-1 rounded-full bg-linear-to-r from-amber-400 via-yellow-300 to-amber-400 px-2.5 py-0.5 text-xs font-bold text-amber-950 shadow-sm"
                >
                  <Crown className="h-3.5 w-3.5" aria-hidden="true" />
                  {plan.name} member
                </Link>
              ) : plan && plan.priceMinor > 0 ? (
                <Link
                  href="/dashboard/billing"
                  className="bg-brand-50 text-brand-800 mt-1 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold"
                >
                  {plan.name} plan
                </Link>
              ) : (
                <Link
                  href="/dashboard/billing"
                  className="mt-1 inline-flex rounded-full bg-neutral-200 px-2.5 py-0.5 text-xs font-medium text-neutral-700 hover:bg-neutral-300"
                >
                  Free · Upgrade
                </Link>
              )}
              <br />
              <a
                href={sellerSiteUrl(scopeSurface(scope))}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-teal-700 underline underline-offset-2"
              >
                {scope.webPresence === "CATALOGUE" ? "View catalogue page ↗" : "View site ↗"}
              </a>
            </div>
            {/* Client component: it needs the current path to mark the active
                page, which a server layout cannot read. */}
            <DashboardNav />
            <div className="mt-6 border-t border-neutral-200 pt-4">
              <SignOutButton />
            </div>
          </aside>

          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
