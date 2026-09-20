import type { Metadata } from "next";
import { headers } from "next/headers";
import { forbidden, notFound, permanentRedirect } from "next/navigation";
import { TENANT_PATH_HEADER } from "@/proxy";
import { DM_Sans, IBM_Plex_Sans, Inter, Lora, Manrope, Source_Sans_3 } from "next/font/google";
import { resolveTenant } from "@/lib/tenant/resolve";
import { themeToCssVars, type ThemeTokens } from "@/lib/validation/theme";
import { marketplacePathFor, marketplaceUrl, tenantUrl } from "@/lib/utils/url";
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

/**
 * The font allowlist behind `themeTokens.fontPair` (D7). Every face is
 * declared here so the CSS variables exist on every microsite; the browser
 * only downloads the one the theme actually uses. A pair is body + heading —
 * "lora" is the editorial combination the boutique-style templates default to.
 */
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const source = Source_Sans_3({ variable: "--font-source", subsets: ["latin"], display: "swap" });
const lora = Lora({ variable: "--font-lora", subsets: ["latin"], display: "swap" });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"], display: "swap" });
const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"], display: "swap" });

const FONT_STACKS: Record<ThemeTokens["fontPair"], { body: string; heading: string }> = {
  inter: { body: "var(--font-inter)", heading: "var(--font-inter)" },
  plex: { body: "var(--font-sans)", heading: "var(--font-sans)" },
  source: { body: "var(--font-source)", heading: "var(--font-source)" },
  lora: { body: "var(--font-inter)", heading: "var(--font-lora)" },
  manrope: { body: "var(--font-manrope)", heading: "var(--font-manrope)" },
  "dm-sans": { body: "var(--font-dm-sans)", heading: "var(--font-dm-sans)" },
};

const FONT_CLASSES = [inter, source, lora, manrope, dmSans].map((font) => font.variable).join(" ");

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

    case "downgraded": {
      // The seller's plan no longer includes a website (decision D32). A 301
      // to the marketplace equivalent keeps the links they printed on visiting
      // cards alive and hands the ranking to the page that now represents them.
      const path = (await headers()).get(TENANT_PATH_HEADER) ?? "/";
      permanentRedirect(marketplaceUrl(marketplacePathFor(result.slug, path)));
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
  const fonts = FONT_STACKS[theme.fontPair];

  return (
    <html
      lang={seller.locale}
      className={`${sans.variable} ${FONT_CLASSES} site-root h-full antialiased`}
      // Validated design tokens only. `themeTokensSchema` constrains every
      // value to a hex colour or a fixed enum member, and React escapes style
      // values — so seller input can never become raw CSS. This is why theme
      // tokens are never concatenated into a <style> block. The font values
      // come from FONT_STACKS above, keyed by an enum — never from the row.
      style={
        {
          ...themeToCssVars(theme),
          "--site-font-body": fonts.body,
          "--site-font-heading": fonts.heading,
        } as React.CSSProperties
      }
    >
      <body
        className="flex min-h-full flex-col"
        style={{
          background: "var(--site-background)",
          color: "var(--site-foreground)",
        }}
      >
        {/* The template's own footer carries the "Powered by" line (SiteFooter
            and the storefront footers both honour theme.showPlatformBranding). */}
        {children}
      </body>
    </html>
  );
}
