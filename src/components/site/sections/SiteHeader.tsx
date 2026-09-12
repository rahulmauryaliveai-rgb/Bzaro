import Link from "next/link";
import { SiteImage } from "@/components/site/sections/SiteImage";
import type { TenantContext } from "@/lib/tenant/context";

/**
 * Shared microsite header.
 *
 * Consumed by every template. Templates differ in layout and emphasis, not in
 * what data they can reach — all of them receive the same `TenantContext` and
 * nothing else.
 */

export function SiteHeader({ context }: { context: TenantContext }) {
  const { seller, nav, theme } = context;
  const items = nav.filter((item) => item.enabled);

  const centered = theme.headerVariant === "centered";

  return (
    <header
      className="border-b"
      style={{ borderColor: "var(--site-border)", background: "var(--site-surface)" }}
    >
      <div
        className={`mx-auto flex max-w-5xl gap-4 px-4 py-4 ${
          centered ? "flex-col items-center text-center" : "items-center justify-between"
        }`}
      >
        <Link href="/" className="flex items-center gap-3">
          {/*
            SiteImage, not next/image. A seller pastes their own logo URL into
            the dashboard, and next/image THROWS on any host missing from
            `images.remotePatterns` — which would take the seller's entire
            website down with a 500 because of one bad field. The rest of the
            microsite already uses SiteImage for this reason; this was the one
            place that did not.
          */}
          {seller.logoUrl ? (
            <SiteImage
              src={seller.logoUrl}
              alt={`${seller.businessName} logo`}
              width={40}
              height={40}
              priority
              className="h-10 w-10 rounded object-contain"
            />
          ) : null}
          <span className="text-lg font-semibold tracking-tight">{seller.businessName}</span>
        </Link>

        <nav className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          {items.map((item) => (
            <Link key={item.href} href={item.href} className="hover:opacity-70">
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
