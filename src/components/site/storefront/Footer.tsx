import Link from "next/link";
import { Clock, Mail, MapPin, Phone } from "lucide-react";
import type { TenantContext } from "@/lib/tenant/context";
import type { SiteCategory } from "@/server/services/site-content.service";
import { SocialLinks } from "@/components/site/sections/SocialLinks";
import { ContactIntent } from "@/components/buyer/ContactIntent";
import { clientEnv } from "@/env.client";
import { CONTAINER, T } from "@/components/site/storefront/tokens";
import { DAYS, formatInterval, parseBusinessHours } from "@/lib/utils/hours";

/**
 * Storefront footer: four columns (about + NAP, pages, categories, contact +
 * hours) and a legal row. Carries the seller's NAP on every page for local
 * SEO, exactly like the shared SiteFooter — this one just has the storefront
 * density the reference themes use.
 *
 *   light  surface background         dark  near-black, for the electronics
 *   brand  the theme's primary colour        and auto-parts looks
 */
export type FooterVariant = "light" | "dark" | "brand";

export function StorefrontFooter({
  context,
  categories = [],
  variant = "light",
}: {
  context: TenantContext;
  categories?: SiteCategory[];
  variant?: FooterVariant;
}) {
  const { seller, nav, theme } = context;
  const items = nav.filter((item) => item.enabled);
  const locality = [seller.address.city, seller.address.state].filter(Boolean).join(", ");
  const address = [seller.address.line1, seller.address.line2, locality, seller.address.postalCode]
    .filter(Boolean)
    .join(", ");
  const hours = seller.businessHours ? summariseHours(seller.businessHours) : null;

  const tone =
    variant === "dark"
      ? "bg-neutral-900 text-neutral-300"
      : variant === "brand"
        ? `${T.primaryBg} text-white/85`
        : `${T.surface} border-t ${T.border}`;
  const heading = variant === "light" ? "" : "text-white";
  const divider = variant === "light" ? T.border : "border-white/15";

  return (
    <footer className={`mt-20 ${tone}`}>
      <div className={`${CONTAINER} grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4`}>
        <div>
          <p className={`site-display text-lg font-bold ${heading}`}>{seller.businessName}</p>
          {seller.legalName && seller.legalName !== seller.businessName ? (
            <p className="mt-1 text-sm opacity-70">{seller.legalName}</p>
          ) : null}
          {seller.tagline ? <p className="mt-3 text-sm opacity-80">{seller.tagline}</p> : null}
          <dl className="mt-4 space-y-2 text-sm">
            {address ? (
              <div className="flex gap-2">
                <dt className="sr-only">Address</dt>
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 opacity-70" aria-hidden="true" />
                <dd>{address}</dd>
              </div>
            ) : null}
            {seller.gstin ? (
              <div className="flex gap-2 text-xs opacity-70">
                <dt>GSTIN</dt>
                <dd className="font-mono">
                  {seller.gstin}
                  {seller.gstinVerified ? " ✓" : ""}
                </dd>
              </div>
            ) : null}
          </dl>
          <div className="mt-4">
            <SocialLinks links={seller.socialLinks} />
          </div>
        </div>

        <div>
          <h2 className={`text-sm font-semibold tracking-wide uppercase ${heading}`}>Pages</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {items.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="opacity-80 hover:opacity-100">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className={`text-sm font-semibold tracking-wide uppercase ${heading}`}>
            {categories.length > 0 ? "Categories" : "Business"}
          </h2>
          <ul className="mt-4 space-y-2 text-sm">
            {categories.length > 0 ? (
              categories.slice(0, 7).map((category) => (
                <li key={category.slug}>
                  <Link
                    href={`/products?category=${encodeURIComponent(category.slug)}`}
                    className="opacity-80 hover:opacity-100"
                  >
                    {category.name}
                  </Link>
                </li>
              ))
            ) : (
              <>
                {seller.establishedYear ? <li>Established {seller.establishedYear}</li> : null}
                {seller.employeeCount ? <li>{seller.employeeCount} employees</li> : null}
                {seller.certifications.map((cert) => (
                  <li key={cert}>{cert}</li>
                ))}
              </>
            )}
          </ul>
        </div>

        <div>
          <h2 className={`text-sm font-semibold tracking-wide uppercase ${heading}`}>Contact</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {seller.phone ? (
              <li>
                <a
                  href={`tel:${seller.phone}`}
                  className="inline-flex items-center gap-2 opacity-80 hover:opacity-100"
                >
                  <Phone className="h-4 w-4" aria-hidden="true" />
                  {seller.phone}
                </a>
              </li>
            ) : null}
            {seller.email ? (
              <li>
                <a
                  href={`mailto:${seller.email}`}
                  className="inline-flex items-center gap-2 opacity-80 hover:opacity-100"
                >
                  <Mail className="h-4 w-4" aria-hidden="true" />
                  {seller.email}
                </a>
              </li>
            ) : null}
            {hours ? (
              <li className="inline-flex items-start gap-2 opacity-80">
                <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{hours}</span>
              </li>
            ) : null}
          </ul>
          <div className="mt-4">
            <ContactIntent seller={seller} show="whatsapp" />
          </div>
        </div>
      </div>

      <div className={`border-t ${divider}`}>
        <div
          className={`${CONTAINER} flex flex-wrap items-center justify-between gap-3 py-5 text-xs opacity-70`}
        >
          <span>
            © {new Date().getFullYear()} {seller.businessName}. All rights reserved.
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

/** "Mon–Sat, 9 am – 6 pm" when the week is regular; otherwise point at the contact page. */
function summariseHours(value: unknown): string | null {
  const hours = parseBusinessHours(value);
  if (!hours) return null;
  const open = DAYS.filter((day) => (hours[day]?.length ?? 0) > 0);
  if (open.length === 0) return null;
  const first = hours[open[0]!]![0]!;
  const same = open.every((day) => {
    const slot = hours[day]?.[0];
    return slot && slot.open === first.open && slot.close === first.close;
  });
  const label = (day: (typeof DAYS)[number]) => day.charAt(0).toUpperCase() + day.slice(1);
  const range =
    open.length === 1 ? label(open[0]!) : `${label(open[0]!)}–${label(open[open.length - 1]!)}`;
  return same ? `${range}, ${formatInterval(first)}` : `${range} — see contact page`;
}
