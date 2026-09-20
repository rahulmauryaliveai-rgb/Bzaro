import type { Metadata } from "next";
import { BrandLogo } from "@/components/shared/BrandLogo";
import { IBM_Plex_Sans } from "next/font/google";
import "../globals.css";

/**
 * Authentication shell.
 *
 * Auth pages live on the apex only. A tenant subdomain never renders a sign-in
 * form — microsites are entirely anonymous, which is what lets them be fully
 * cached and what keeps the session cookie off tenant hosts.
 */

const sans = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-neutral-50 text-neutral-900">
        {/*
          The layout centres; each PAGE chooses its own width. Sign-in wants a
          narrow column, business registration needs room for a category
          picker — constraining both here would make one of them wrong.
        */}
        <div className="flex flex-1 flex-col items-center px-4 py-16">
          <div className="mb-8">
            <BrandLogo variant="full" height={64} priority />
          </div>
          {children}
        </div>
      </body>
    </html>
  );
}
