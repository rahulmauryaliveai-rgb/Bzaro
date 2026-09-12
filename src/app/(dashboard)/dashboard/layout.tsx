import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import { requireSeller } from "@/lib/auth/guards";
import { tenantUrl } from "@/lib/utils/url";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import "../../globals.css";

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

  return (
    <html lang="en" className={`${sans.variable} h-full antialiased`}>
      <body className="min-h-full bg-neutral-50 text-neutral-900">
        <div className="mx-auto flex max-w-7xl gap-8 px-4 py-8">
          <aside className="w-56 shrink-0">
            <div className="mb-6">
              <p className="text-xs tracking-wide text-neutral-500 uppercase">Signed in as</p>
              <p className="truncate font-medium">{scope.sellerSlug}</p>
              <a
                href={tenantUrl(scope.sellerSlug)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-teal-700 underline underline-offset-2"
              >
                View site ↗
              </a>
            </div>
            {/* Client component: it needs the current path to mark the active
                page, which a server layout cannot read. */}
            <DashboardNav />
          </aside>

          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
