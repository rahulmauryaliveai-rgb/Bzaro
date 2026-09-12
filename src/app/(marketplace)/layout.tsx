import type { Metadata } from "next";
import Link from "next/link";
import { IBM_Plex_Sans } from "next/font/google";
import { clientEnv } from "@/env.client";
import { marketplaceUrl } from "@/lib/utils/url";
import "../globals.css";

/**
 * Root layout for the public marketplace (bzaro.in).
 *
 * Each of the four surfaces owns its own root layout — its own <html>, fonts
 * and chrome — because they are genuinely different documents. A microsite sets
 * `lang` from the seller's locale and injects that seller's theme; the
 * dashboard is a private application shell. Forcing them through one shared
 * root layout would mean every surface carrying the others' baggage.
 */

const sans = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(marketplaceUrl()),
  title: {
    default: `${clientEnv.NEXT_PUBLIC_PLATFORM_NAME} — B2B marketplace`,
    template: `%s | ${clientEnv.NEXT_PUBLIC_PLATFORM_NAME}`,
  },
  description:
    "Find verified suppliers, manufacturers and service providers. Every seller gets their own business website.",
  robots: { index: true, follow: true },
};

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-white text-neutral-900">
        <header className="border-b border-neutral-200">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              {clientEnv.NEXT_PUBLIC_PLATFORM_NAME}
            </Link>
            <nav className="flex items-center gap-6 text-sm">
              <Link href="/search" className="hover:text-neutral-600">
                Search
              </Link>
              <Link href="/sellers" className="hover:text-neutral-600">
                Sellers
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-neutral-900 px-3 py-1.5 text-white hover:bg-neutral-700"
              >
                List your business
              </Link>
            </nav>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-neutral-200 py-8">
          <div className="mx-auto max-w-6xl px-4 text-sm text-neutral-500">
            © {new Date().getFullYear()} {clientEnv.NEXT_PUBLIC_PLATFORM_NAME}
          </div>
        </footer>
      </body>
    </html>
  );
}
