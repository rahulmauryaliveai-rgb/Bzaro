import Link from "next/link";
import type { TenantContext } from "@/lib/tenant/context";
import { clientEnv } from "@/env.client";

/**
 * Microsite footer.
 *
 * Carries the seller's NAP (name, address, phone) — the trio local search uses
 * to corroborate a business across the web. Repeating it in the footer of every
 * page is standard practice for local SEO and costs nothing.
 *
 * Platform branding is suppressed for plans with `removeBranding` (D5), which
 * is one of the things a paid plan actually buys.
 */

export function SiteFooter({ context }: { context: TenantContext }) {
  const { seller, nav, theme } = context;
  const items = nav.filter((item) => item.enabled);

  const locality = [seller.address.city, seller.address.state].filter(Boolean).join(", ");

  return (
    <footer className="mt-16 border-t" style={{ borderColor: "var(--site-border)" }}>
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="grid gap-8 sm:grid-cols-3">
          <div>
            <p className="font-semibold">{seller.businessName}</p>
            {seller.legalName && seller.legalName !== seller.businessName ? (
              <p className="mt-1 text-sm opacity-60">{seller.legalName}</p>
            ) : null}
            {locality ? <p className="mt-2 text-sm opacity-70">{locality}</p> : null}
          </div>

          <nav aria-label="Footer">
            <ul className="space-y-1.5 text-sm">
              {items.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="opacity-70 hover:opacity-100">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="space-y-1.5 text-sm">
            {seller.phone ? (
              <a href={`tel:${seller.phone}`} className="block opacity-70 hover:opacity-100">
                {seller.phone}
              </a>
            ) : null}
            {seller.email ? (
              <a href={`mailto:${seller.email}`} className="block opacity-70 hover:opacity-100">
                {seller.email}
              </a>
            ) : null}
          </div>
        </div>

        <div
          className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t pt-6 text-sm opacity-60"
          style={{ borderColor: "var(--site-border)" }}
        >
          <span>
            © {new Date().getFullYear()} {seller.businessName}
          </span>

          {theme.showPlatformBranding ? (
            <span>
              Powered by{" "}
              <a
                href={`${clientEnv.NEXT_PUBLIC_PROTOCOL}://${clientEnv.NEXT_PUBLIC_ROOT_DOMAIN}`}
                className="underline underline-offset-2"
              >
                {clientEnv.NEXT_PUBLIC_PLATFORM_NAME}
              </a>
            </span>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
