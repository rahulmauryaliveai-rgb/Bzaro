import type { Metadata } from "next";
import { headers } from "next/headers";
import { forbidden, notFound, permanentRedirect } from "next/navigation";
import { TENANT_PATH_HEADER } from "@/proxy";
import { IBM_Plex_Sans } from "next/font/google";
import { resolveTenant } from "@/lib/tenant/resolve";
import { themeToCssVars } from "@/lib/validation/theme";
import { tenantUrl } from "@/lib/utils/url";
import { clientEnv } from "@/env.client";
import "../../../globals.css";

/**
 * Root layout for every seller microsite ({slug}.bzaro.in).
 *
 * This is the only place a tenant is resolved. Everything below receives the
 * resolved context as props, so templates stay pure functions of their input:
 * testable in isolation, previewable in the dashboard, and incapable of firing
 * a surprise query from deep in the tree.
 *
 * The `[tenant]` parameter is written by src/proxy.ts. It is part of the
 * pathname — and therefore part of the Next.js cache key — which is what
 * prevents one seller's cached page from being served on another's hostname.
 */

const sans = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

type Props = {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenant: string }>;
}): Promise<Metadata> {
  const { tenant } = await params;
  const result = await resolveTenant(tenant);

  if (result.kind !== "found") {
    return { title: "Not found", robots: { index: false, follow: false } };
  }

  const { seller, website, urls } = result.tenant;
  const title =
    website.metaTitle ?? `${seller.businessName}${seller.tagline ? ` — ${seller.tagline}` : ""}`;
  const description =
    website.metaDescription ??
    seller.description?.slice(0, 160) ??
    `${seller.businessName} — products, services and contact details.`;

  return {
    metadataBase: new URL(urls.base),
    title: { default: title, template: `%s | ${seller.businessName}` },
    description,
    alternates: { canonical: urls.canonical },

    /**
     * Decision D2, enforced here.
     *
     * A microsite is `noindex` until it is verified and substantially complete.
     * Thousands of near-empty auto-generated subdomains is the textbook doorway
     * page pattern, and the penalty attaches to the root domain — every seller
     * at once, not just the empty ones. `indexable` is computed in the write
     * path and persisted, so this is a field read rather than a scoring pass on
     * every request.
     */
    robots: website.indexable ? { index: true, follow: true } : { index: false, follow: true },

    openGraph: {
      type: "website",
      siteName: seller.businessName,
      title,
      description,
      url: urls.canonical,
      images: website.ogImageUrl ?? seller.coverImageUrl ?? undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: website.ogImageUrl ?? seller.coverImageUrl ?? undefined,
    },
  };
}

export default async function SiteLayout({ children, params }: Props) {
  const { tenant } = await params;
  const result = await resolveTenant(tenant);

  switch (result.kind) {
    case "redirect": {
      // The seller renamed their slug. A permanent redirect preserves inbound
      // links and the search ranking attached to them (decision D11).
      //
      // The PATH has to be carried across too. Redirecting every old URL to
      // the new homepage discards the ranking of every deep page the seller
      // had, and Google treats a redirect to an unrelated page as a soft 404 —
      // so the rename would quietly cost exactly what the redirect exists to
      // protect. The proxy passes the original path in a header because a
      // layout cannot otherwise see which page below it was requested.
      const path = (await headers()).get(TENANT_PATH_HEADER) ?? "/";
      permanentRedirect(tenantUrl(result.toSlug, path));
    }

    case "suspended":
      // Must be `forbidden()`, not a rendered notice. A React Server Component
      // cannot set a status code, so returning JSX here served the suspension
      // page with HTTP 200 — which tells crawlers the page is fine and lets
      // intermediaries cache it. `forbidden()` (enabled by
      // experimental.authInterrupts) produces a real 403 and renders
      // forbidden.tsx.
      forbidden();

    case "not_found":
    case "gone":
      notFound();

    case "found":
      break;
  }

  const { seller, theme } = result.tenant;

  return (
    <html
      lang={seller.locale}
      className={`${sans.variable} h-full antialiased`}
      // Validated design tokens only. `themeTokensSchema` constrains every
      // value to a hex colour or a fixed enum member, and React escapes style
      // values — so seller input can never become raw CSS. This is why theme
      // tokens are never concatenated into a <style> block.
      style={themeToCssVars(theme)}
    >
      <body
        className="flex min-h-full flex-col"
        style={{
          background: "var(--site-background)",
          color: "var(--site-foreground)",
        }}
      >
        {children}

        {theme.showPlatformBranding && (
          <footer className="border-t py-6" style={{ borderColor: "var(--site-border)" }}>
            <div className="mx-auto max-w-5xl px-4 text-sm opacity-70">
              {seller.businessName} · powered by{" "}
              <a
                href={`${clientEnv.NEXT_PUBLIC_PROTOCOL}://${clientEnv.NEXT_PUBLIC_ROOT_DOMAIN}`}
                className="underline underline-offset-2"
              >
                {clientEnv.NEXT_PUBLIC_PLATFORM_NAME}
              </a>
            </div>
          </footer>
        )}
      </body>
    </html>
  );
}
