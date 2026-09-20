import Link from "next/link";
import { Mail, MapPin, Phone, Search } from "lucide-react";
import type { TenantContext } from "@/lib/tenant/context";
import type { SiteCategory } from "@/server/services/site-content.service";
import { SiteImage } from "@/components/site/sections/SiteImage";
import { ContactIntent } from "@/components/buyer/ContactIntent";
import { CONTAINER, T } from "@/components/site/storefront/tokens";

/**
 * Storefront header — the e-commerce three-tier pattern the reference themes
 * share: a thin contact bar, a main row with logo + search + primary action,
 * and a category bar. Variants only change colour placement and which rows
 * show; the data (nav, categories, contact) is the same TenantContext every
 * template receives.
 *
 *   mega      light main row, coloured category bar          (electronics, medical)
 *   dark      dark top+category bars, light main row         (auto parts)
 *   clean     single row, no category bar, search inline     (minimal, boutique)
 *   centered  logo centred over the nav, search below         (editorial)
 *   fresh     rounded search, coloured top bar, light chips   (grocery / plants)
 */
export type HeaderVariant = "mega" | "dark" | "clean" | "centered" | "fresh";

export function StorefrontHeader({
  context,
  categories = [],
  variant = "mega",
}: {
  context: TenantContext;
  categories?: SiteCategory[];
  variant?: HeaderVariant;
}) {
  const { seller, nav } = context;
  const items = nav.filter((item) => item.enabled);
  const locality = [seller.address.city, seller.address.state].filter(Boolean).join(", ");
  const showCategoryBar =
    categories.length > 0 && (variant === "mega" || variant === "dark" || variant === "fresh");
  const showSearch = context.seller.productCount > 0;

  const topBarClass =
    variant === "dark"
      ? "bg-neutral-900 text-neutral-300"
      : variant === "fresh"
        ? `${T.primaryBg}`
        : `border-b ${T.border} ${T.surface}`;

  return (
    <header className="relative z-30">
      {/* ── Contact bar ── */}
      {variant !== "clean" ? (
        <div className={`${topBarClass} text-xs`}>
          <div className={`${CONTAINER} flex h-9 items-center justify-between gap-4`}>
            <div className="flex min-w-0 items-center gap-5">
              {seller.phone ? (
                <a
                  href={`tel:${seller.phone}`}
                  className="inline-flex items-center gap-1.5 hover:opacity-80"
                >
                  <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                  {seller.phone}
                </a>
              ) : null}
              {seller.email ? (
                <a
                  href={`mailto:${seller.email}`}
                  className="hidden items-center gap-1.5 hover:opacity-80 sm:inline-flex"
                >
                  <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                  {seller.email}
                </a>
              ) : null}
            </div>
            <div className="flex items-center gap-4">
              {locality ? (
                <span className="hidden items-center gap-1.5 sm:inline-flex">
                  <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                  {locality}
                </span>
              ) : null}
              {seller.isVerified ? (
                <span className="inline-flex items-center gap-1 font-medium">
                  <span aria-hidden="true">✓</span> Verified supplier
                </span>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Main row ── */}
      <div className={`border-b ${T.border} ${T.background}`}>
        <div
          className={`${CONTAINER} flex flex-wrap items-center gap-x-6 gap-y-3 py-4 ${
            variant === "centered" ? "flex-col" : ""
          }`}
        >
          <Brand seller={seller} large={variant === "centered"} />

          {variant === "centered" ? <Nav items={items} className="justify-center" /> : null}

          {showSearch ? (
            <SearchForm
              variant={variant}
              className={
                variant === "centered"
                  ? "w-full max-w-xl"
                  : variant === "clean"
                    ? "order-last w-full lg:order-none lg:max-w-sm lg:flex-1"
                    : "order-last w-full lg:order-none lg:flex-1"
              }
            />
          ) : null}

          {variant !== "centered" ? (
            <Nav items={items} className={variant === "clean" ? "ml-auto" : "hidden xl:flex"} />
          ) : null}

          {variant !== "centered" ? (
            <div className={variant === "clean" ? "" : "ml-auto flex items-center gap-3"}>
              {/* Contact-intent modal, never a raw wa.me link: the number is
                  released only after the buyer leaves a requirement (LEADS §1). */}
              <ContactIntent
                seller={seller}
                show="whatsapp"
                className="flex"
                whatsappClassName={`inline-flex items-center gap-2 ${T.radiusSm} bg-[#25D366] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1eb855]`}
                priceClassName={`inline-flex items-center gap-2 ${T.primaryBg} ${T.radiusSm} px-4 py-2 text-sm font-semibold`}
              />
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Category bar ── */}
      {showCategoryBar ? (
        <div
          className={
            variant === "dark"
              ? "bg-neutral-900 text-white"
              : variant === "fresh"
                ? `border-b ${T.border} ${T.background}`
                : `${T.primaryBg}`
          }
        >
          <nav
            aria-label="Product categories"
            className={`${CONTAINER} flex [scrollbar-width:none] items-center gap-1 overflow-x-auto text-sm`}
          >
            <Link
              href="/products"
              className={`shrink-0 px-3 py-2.5 font-semibold ${
                variant === "fresh" ? T.primaryText : "bg-black/15"
              }`}
            >
              All products
            </Link>
            {categories.slice(0, 9).map((category) => (
              <Link
                key={category.slug}
                href={`/products?category=${encodeURIComponent(category.slug)}`}
                className={`shrink-0 px-3 py-2.5 transition-opacity hover:opacity-75 ${
                  variant === "fresh" ? "font-medium" : "text-white/90"
                }`}
              >
                {category.name}
              </Link>
            ))}
            <div className="ml-auto hidden shrink-0 items-center gap-4 md:flex">
              {items
                .filter((item) => item.href !== "/" && item.href !== "/products")
                .map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-1 py-2.5 hover:opacity-75 ${variant === "fresh" ? "" : "text-white/90"}`}
                  >
                    {item.label}
                  </Link>
                ))}
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}

function Brand({ seller, large }: { seller: TenantContext["seller"]; large?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-3">
      {seller.logoUrl ? (
        <SiteImage
          src={seller.logoUrl}
          alt={`${seller.businessName} logo`}
          width={large ? 56 : 44}
          height={large ? 56 : 44}
          priority
          className={`${large ? "h-14 w-14" : "h-11 w-11"} ${T.radiusSm} object-contain`}
        />
      ) : (
        <span
          className={`flex ${large ? "h-14 w-14 text-2xl" : "h-11 w-11 text-xl"} items-center justify-center ${T.primaryBg} ${T.radiusSm} font-bold`}
        >
          {seller.businessName.charAt(0)}
        </span>
      )}
      <span className="min-w-0">
        <span
          className={`site-display block truncate font-bold tracking-tight ${large ? "text-2xl" : "text-xl"}`}
        >
          {seller.businessName}
        </span>
        {seller.tagline && !large ? (
          <span className="hidden truncate text-xs opacity-60 md:block">{seller.tagline}</span>
        ) : null}
      </span>
    </Link>
  );
}

function Nav({ items, className = "" }: { items: TenantContext["nav"]; className?: string }) {
  return (
    <nav className={`flex flex-wrap items-center gap-x-5 gap-y-1 text-sm font-medium ${className}`}>
      {items.map((item) => (
        <Link key={item.href} href={item.href} className="hover:opacity-70">
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function SearchForm({ variant, className = "" }: { variant: HeaderVariant; className?: string }) {
  const round = variant === "fresh" ? "rounded-full" : T.radiusSm;
  return (
    <form action="/products" method="get" role="search" className={className}>
      <label htmlFor="storefront-search" className="sr-only">
        Search products
      </label>
      <div className={`flex overflow-hidden border ${T.border} ${round} ${T.surface}`}>
        <input
          id="storefront-search"
          type="search"
          name="q"
          maxLength={80}
          placeholder="Search products…"
          className="min-w-0 flex-1 bg-transparent px-4 py-2 text-sm outline-none placeholder:opacity-60"
        />
        <button
          type="submit"
          className={`inline-flex items-center gap-1.5 px-4 text-sm font-semibold ${T.primaryBg}`}
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Search</span>
        </button>
      </div>
    </form>
  );
}
