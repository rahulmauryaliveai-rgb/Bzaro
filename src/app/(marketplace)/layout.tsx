import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import { clientEnv } from "@/env.client";
import { marketplaceUrl } from "@/lib/utils/url";
import { SiteHeader } from "@/components/marketplace/SiteHeader";
import { LocationBar } from "@/components/marketplace/LocationBar";
import { SiteFooter } from "@/components/marketplace/SiteFooter";
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
    "Find verified suppliers, manufacturers and service providers. Free listing for sellers; websites on the Gold plan.",
  robots: { index: true, follow: true },
};

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-white text-neutral-900">
        <SiteHeader />
        <LocationBar />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
