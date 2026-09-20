import Link from "next/link";
import { ArrowRight, BadgeCheck } from "lucide-react";
import type { TenantContext } from "@/lib/tenant/context";
import type { HomeProps } from "@/components/site/templates/registry";
import { SiteImage } from "@/components/site/sections/SiteImage";
import { ContactIntent } from "@/components/buyer/ContactIntent";
import {
  BTN_ACCENT,
  BTN_OUTLINE,
  BTN_PRIMARY,
  BTN_WHITE,
  CONTAINER,
  T,
  excerpt,
} from "@/components/site/storefront/tokens";

/**
 * Storefront hero, in the shapes the reference themes use.
 *
 *   split      big banner + two side promo tiles           (XStore electronics)
 *   sidebar    category list beside the banner            (Ochaka medical / auto)
 *   product    copy left, product image right on surface  (XStore minimal / tech)
 *   cover      full-bleed image with copy overlaid        (Ochaka art / fashion)
 *   editorial  centred copy above a wide image            (boutique)
 *   stats      copy + three counters, image right          (XStore plants)
 *
 * The banner image is the seller's cover image, else the lead product's
 * photo, else a brand-coloured panel. Copy is business name + tagline +
 * the first sentence or two of the description — sellers write no hero copy.
 */
export type HeroVariant = "split" | "sidebar" | "product" | "cover" | "editorial" | "stats";

type HeroProps = {
  context: TenantContext;
  data: HomeProps["data"];
  variant?: HeroVariant;
};

function pickImages(context: TenantContext, data: HomeProps["data"]) {
  const productImages = data.products.filter((p) => p.images[0]);
  const banner = context.seller.coverImageUrl ?? productImages[0]?.images[0]?.url ?? null;
  const tiles = productImages.filter((p) => p.images[0]!.url !== banner).slice(0, 2);
  return { banner, tiles, leadProduct: productImages[0] ?? null };
}

function Copy({
  seller,
  onDark = false,
  align = "left",
  size = "lg",
}: {
  seller: TenantContext["seller"];
  onDark?: boolean;
  align?: "left" | "center";
  size?: "lg" | "xl";
}) {
  const standfirst = excerpt(seller.description, 200);
  return (
    <div className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-xl"}>
      {seller.isVerified ? (
        <p
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
            onDark ? "bg-white/15 text-white" : `${T.surface} ${T.primaryText}`
          }`}
        >
          <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Verified supplier
          {seller.address.city ? ` · ${seller.address.city}` : ""}
        </p>
      ) : null}
      <h1
        className={`site-display mt-4 font-bold tracking-tight text-balance ${
          size === "xl" ? "text-4xl sm:text-5xl lg:text-6xl" : "text-3xl sm:text-4xl lg:text-5xl"
        }`}
      >
        {seller.tagline ?? seller.businessName}
      </h1>
      {seller.tagline ? (
        <p className={`mt-2 text-lg font-medium ${onDark ? "opacity-90" : "opacity-70"}`}>
          {seller.businessName}
        </p>
      ) : null}
      {standfirst ? (
        <p
          className={`mt-4 text-base leading-relaxed sm:text-lg ${onDark ? "opacity-85" : "opacity-75"}`}
        >
          {standfirst}
        </p>
      ) : null}
      <div className={`mt-7 flex flex-wrap gap-3 ${align === "center" ? "justify-center" : ""}`}>
        <Link href="/products" className={onDark ? BTN_WHITE : BTN_PRIMARY}>
          Browse products
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
        <ContactIntent
          seller={seller}
          show="whatsapp"
          className="flex"
          whatsappClassName={
            onDark ? `${BTN_OUTLINE} border-white/40 text-white hover:bg-white/10` : BTN_ACCENT
          }
          priceClassName={
            onDark ? `${BTN_OUTLINE} border-white/40 text-white hover:bg-white/10` : BTN_ACCENT
          }
        />
      </div>
    </div>
  );
}

function Banner({
  image,
  seller,
  className = "",
  priority = true,
  children,
}: {
  image: string | null;
  seller: TenantContext["seller"];
  className?: string;
  priority?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`relative overflow-hidden ${T.radius} ${image ? "bg-neutral-900" : T.primaryBg} ${className}`}
    >
      {image ? (
        <SiteImage
          src={image}
          alt=""
          priority={priority}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.25),transparent_50%)]"
        />
      )}
      <span
        className="absolute inset-0 bg-linear-to-r from-black/70 via-black/35 to-transparent"
        aria-hidden="true"
      />
      <div className="relative flex h-full flex-col justify-center p-8 text-white lg:p-12">
        {children ?? <Copy seller={seller} onDark />}
      </div>
    </div>
  );
}

export function StorefrontHero({ context, data, variant = "split" }: HeroProps) {
  const { seller } = context;
  const { banner, tiles, leadProduct } = pickImages(context, data);

  switch (variant) {
    case "split":
      return (
        <section className={`${CONTAINER} pt-6`}>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Banner image={banner} seller={seller} className="min-h-[26rem]" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              {tiles.map((product) => (
                <Link
                  key={product.id}
                  href={`/products/${product.slug}`}
                  className={`group relative flex min-h-48 items-end overflow-hidden ${T.radius} ${T.surface}`}
                >
                  <SiteImage
                    src={product.images[0]!.url}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <span className="absolute inset-0 bg-linear-to-t from-black/70 to-transparent" />
                  <span className="relative p-5 text-white">
                    <span className="block text-xs tracking-wide uppercase opacity-80">
                      {product.category?.name ?? "Featured"}
                    </span>
                    <span className="site-display mt-1 block text-lg font-bold">
                      {product.name}
                    </span>
                    <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold">
                      Get quote <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </span>
                  </span>
                </Link>
              ))}
              {tiles.length < 2 ? (
                <div
                  className={`flex min-h-48 flex-col justify-center ${T.radius} ${T.surface} p-5`}
                >
                  <span className={`text-xs font-semibold tracking-wide uppercase ${T.accentText}`}>
                    Talk to us
                  </span>
                  <span className="site-display mt-1 text-lg font-bold">
                    Bulk & wholesale enquiries
                  </span>
                  <span className="mt-1 text-sm opacity-70">
                    Custom specifications and volume pricing on request.
                  </span>
                  <Link href="/contact" className={`${BTN_PRIMARY} mt-4 self-start`}>
                    Contact us
                  </Link>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      );

    case "sidebar":
      return (
        <section className={`${CONTAINER} pt-6`}>
          <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
            <nav
              aria-label="Categories"
              className={`hidden border ${T.border} ${T.radius} ${T.background} lg:block`}
            >
              <p
                className={`${T.primaryBg} rounded-t-(--site-radius) px-4 py-3 text-sm font-semibold`}
              >
                All categories
              </p>
              <ul className="divide-y text-sm [&>li]:border-(--site-border)">
                {data.categories.slice(0, 10).map((category) => (
                  <li key={category.slug}>
                    <Link
                      href={`/products?category=${encodeURIComponent(category.slug)}`}
                      className="flex items-center justify-between px-4 py-2.5 hover:bg-(--site-surface)"
                    >
                      {category.name}
                      <span className="text-xs opacity-50">{category.count}</span>
                    </Link>
                  </li>
                ))}
                {data.categories.length === 0 ? (
                  <li className="px-4 py-3 opacity-60">Products coming soon</li>
                ) : null}
              </ul>
            </nav>
            <div className="grid gap-4 lg:grid-rows-[minmax(0,1fr)_auto]">
              <Banner image={banner} seller={seller} className="min-h-[22rem]" />
              {tiles.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {tiles.map((product) => (
                    <Link
                      key={product.id}
                      href={`/products/${product.slug}`}
                      className={`group flex items-center gap-4 overflow-hidden ${T.radius} ${T.surface} p-4`}
                    >
                      <span className="min-w-0 flex-1">
                        <span
                          className={`text-xs font-semibold tracking-wide uppercase ${T.accentText}`}
                        >
                          Featured
                        </span>
                        <span className="site-display mt-1 block truncate text-lg font-bold">
                          {product.name}
                        </span>
                        <span
                          className={`mt-2 inline-flex items-center gap-1 text-sm font-semibold ${T.primaryText}`}
                        >
                          Get quote <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </span>
                      </span>
                      <span
                        className={`h-24 w-24 shrink-0 overflow-hidden ${T.radiusSm} ${T.background}`}
                      >
                        <SiteImage
                          src={product.images[0]!.url}
                          alt=""
                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                        />
                      </span>
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </section>
      );

    case "product":
      return (
        <section className={`${CONTAINER} pt-6`}>
          <div
            className={`grid items-center gap-8 overflow-hidden ${T.radius} ${T.surface} p-8 lg:grid-cols-2 lg:p-14`}
          >
            <Copy seller={seller} size="xl" />
            <div className="relative">
              {banner ? (
                <SiteImage
                  src={banner}
                  alt=""
                  priority
                  className={`aspect-4/3 w-full object-cover ${T.radius}`}
                />
              ) : (
                <div className={`aspect-4/3 w-full ${T.radius} ${T.primaryBg} opacity-80`} />
              )}
              {leadProduct && leadProduct.images[0]?.url !== banner ? (
                <Link
                  href={`/products/${leadProduct.slug}`}
                  className={`absolute -bottom-4 -left-4 hidden items-center gap-3 ${T.radius} ${T.background} p-3 shadow-xl ring-1 ring-black/5 sm:flex`}
                >
                  <span className={`h-14 w-14 overflow-hidden ${T.radiusSm} ${T.surface}`}>
                    <SiteImage
                      src={leadProduct.images[0]!.url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </span>
                  <span>
                    <span className="block text-xs opacity-60">Featured</span>
                    <span className="block max-w-40 truncate text-sm font-semibold">
                      {leadProduct.name}
                    </span>
                  </span>
                </Link>
              ) : null}
            </div>
          </div>
        </section>
      );

    case "cover":
      return (
        <section className="relative min-h-[32rem] overflow-hidden bg-neutral-900">
          {banner ? (
            <SiteImage
              src={banner}
              alt=""
              priority
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className={`absolute inset-0 ${T.primaryBg}`} />
          )}
          <span
            className="absolute inset-0 bg-linear-to-r from-black/75 via-black/40 to-black/10"
            aria-hidden="true"
          />
          <div className={`${CONTAINER} relative flex min-h-[32rem] items-center py-16 text-white`}>
            <Copy seller={seller} onDark size="xl" />
          </div>
        </section>
      );

    case "editorial":
      return (
        <section className={`${CONTAINER} pt-12`}>
          <Copy seller={seller} align="center" size="xl" />
          {banner ? (
            <div className={`mt-10 aspect-21/9 overflow-hidden ${T.radius} ${T.surface}`}>
              <SiteImage src={banner} alt="" priority className="h-full w-full object-cover" />
            </div>
          ) : null}
        </section>
      );

    case "stats": {
      const facts = [
        seller.establishedYear
          ? {
              value: String(new Date().getFullYear() - seller.establishedYear) + "+",
              label: "Years in business",
            }
          : null,
        data.counts.products > 0
          ? { value: String(data.counts.products), label: "Products" }
          : null,
        data.categories.length > 0
          ? { value: String(data.categories.length), label: "Categories" }
          : null,
        seller.employeeCount ? { value: seller.employeeCount, label: "Team" } : null,
      ].filter(Boolean) as Array<{ value: string; label: string }>;

      return (
        <section className={`${CONTAINER} pt-6`}>
          <div className="grid items-stretch gap-6 lg:grid-cols-2">
            <div className={`flex flex-col justify-center ${T.radius} ${T.surface} p-8 lg:p-12`}>
              <Copy seller={seller} size="xl" />
              {facts.length >= 2 ? (
                <dl className="mt-10 flex flex-wrap gap-10">
                  {facts.slice(0, 3).map((fact) => (
                    <div key={fact.label}>
                      <dd className={`site-display text-3xl font-bold ${T.primaryText}`}>
                        {fact.value}
                      </dd>
                      <dt className="text-sm opacity-70">{fact.label}</dt>
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>
            <div
              className={`min-h-[22rem] overflow-hidden ${T.radius} ${banner ? "" : T.primaryBg}`}
            >
              {banner ? (
                <SiteImage src={banner} alt="" priority className="h-full w-full object-cover" />
              ) : null}
            </div>
          </div>
        </section>
      );
    }
  }
}
