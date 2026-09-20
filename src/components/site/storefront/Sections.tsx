import Link from "next/link";
import {
  ArrowRight,
  Award,
  BadgeCheck,
  Building2,
  Clock,
  MapPin,
  MessageCircle,
  Phone,
  ShieldCheck,
  Truck,
  Users,
} from "lucide-react";
import type { TenantContext } from "@/lib/tenant/context";
import type { HomeProps } from "@/components/site/templates/registry";
import type { SiteCategory } from "@/server/services/site-content.service";
import { SiteImage } from "@/components/site/sections/SiteImage";
import { ServiceCard } from "@/components/site/sections/ServiceCard";
import { ContactIntent } from "@/components/buyer/ContactIntent";
import { ProductTile, type ProductTileVariant } from "@/components/site/storefront/ProductTile";
import {
  BTN_OUTLINE,
  BTN_PRIMARY,
  BTN_WHITE,
  CONTAINER,
  T,
  excerpt,
} from "@/components/site/storefront/tokens";

/**
 * Storefront home-page sections.
 *
 * Each is a pure function of TenantContext + HomeProps data, renders nothing
 * when it has nothing to show, and takes only presentational props. The six
 * storefront templates are compositions of these; the sections never know
 * which template is calling.
 */

type HomeData = HomeProps["data"];
type Seller = TenantContext["seller"];

/* ────────────────────────── headings ────────────────────────── */

export function SectionTitle({
  title,
  eyebrow,
  description,
  action,
  align = "left",
  className = "",
}: {
  title: string;
  eyebrow?: string;
  description?: string | null;
  action?: { href: string; label: string };
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div
      className={`mb-7 flex flex-wrap items-end gap-4 ${
        align === "center" ? "flex-col items-center text-center" : "justify-between"
      } ${className}`}
    >
      <div>
        {eyebrow ? (
          <p className={`text-xs font-semibold tracking-widest uppercase ${T.accentText}`}>
            {eyebrow}
          </p>
        ) : null}
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-balance sm:text-3xl">{title}</h2>
        {description ? <p className="mt-2 max-w-2xl opacity-70">{description}</p> : null}
      </div>
      {action ? (
        <Link
          href={action.href}
          className={`inline-flex items-center gap-1 text-sm font-semibold ${T.primaryText} hover:underline`}
        >
          {action.label}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}

/* ────────────────────────── categories ────────────────────────── */

/**
 * Category rail.
 *   circles  round thumbnails with a label below (Ochaka)
 *   cards    image cards with the name overlaid (XStore minimal)
 *   pills    image tiles with a pill label (Ochaka fashion)
 */
export function CategoryRail({
  categories,
  variant = "circles",
  title = "Shop by category",
  eyebrow,
  align,
}: {
  categories: SiteCategory[];
  variant?: "circles" | "cards" | "pills";
  title?: string;
  eyebrow?: string;
  align?: "left" | "center";
}) {
  if (categories.length < 2) return null;
  const items = categories.slice(0, 8);

  return (
    <section className={`${CONTAINER} py-14`}>
      <SectionTitle
        title={title}
        eyebrow={eyebrow}
        align={align}
        action={{ href: "/products", label: "All products" }}
      />
      <ul
        className={
          variant === "circles"
            ? "grid grid-cols-3 gap-6 sm:grid-cols-4 lg:grid-cols-8"
            : "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
        }
      >
        {items.map((category) => (
          <li key={category.slug}>
            <Link
              href={`/products?category=${encodeURIComponent(category.slug)}`}
              className={`group block ${variant === "circles" ? "text-center" : ""}`}
            >
              {variant === "circles" ? (
                <>
                  <span
                    className={`mx-auto block aspect-square w-full max-w-28 overflow-hidden rounded-full ${T.surface} ring-1 ring-black/5 transition-transform group-hover:scale-105`}
                  >
                    {category.imageUrl ? (
                      <SiteImage
                        src={category.imageUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span
                        className={`flex h-full w-full items-center justify-center text-2xl font-bold ${T.primaryText}`}
                      >
                        {category.name.charAt(0)}
                      </span>
                    )}
                  </span>
                  <span className="mt-3 block text-sm font-medium">{category.name}</span>
                  <span className="block text-xs opacity-60">
                    {category.count} product{category.count === 1 ? "" : "s"}
                  </span>
                </>
              ) : variant === "cards" ? (
                <span
                  className={`relative block aspect-4/3 overflow-hidden ${T.radius} ${T.surface}`}
                >
                  {category.imageUrl ? (
                    <SiteImage
                      src={category.imageUrl}
                      alt=""
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : null}
                  <span className="absolute inset-x-0 top-0 p-4">
                    <span className="site-display block text-lg font-bold drop-shadow-sm">
                      {category.name}
                    </span>
                    <span className="text-xs opacity-70">{category.count} products</span>
                  </span>
                </span>
              ) : (
                <span
                  className={`relative block aspect-3/4 overflow-hidden ${T.radius} ${T.surface}`}
                >
                  {category.imageUrl ? (
                    <SiteImage
                      src={category.imageUrl}
                      alt=""
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : null}
                  <span className="absolute inset-x-0 bottom-4 flex justify-center">
                    <span className="rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-neutral-900 shadow">
                      {category.name}
                    </span>
                  </span>
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ────────────────────────── USPs ────────────────────────── */

/** Reasons to buy, derived from what the seller has actually filled in. */
export function uspsFor(
  seller: Seller,
): Array<{ icon: typeof ShieldCheck; title: string; body: string }> {
  const usps: Array<{ icon: typeof ShieldCheck; title: string; body: string }> = [];
  if (seller.isVerified) {
    usps.push({
      icon: ShieldCheck,
      title: "Verified business",
      body: seller.gstinVerified ? "GSTIN verified on Bzaro" : "Business details verified",
    });
  }
  if (seller.establishedYear) {
    const years = new Date().getFullYear() - seller.establishedYear;
    usps.push({
      icon: Building2,
      title: `Since ${seller.establishedYear}`,
      body: years >= 2 ? `${years}+ years in business` : "Established supplier",
    });
  }
  if (seller.whatsapp || seller.phone) {
    usps.push({
      icon: MessageCircle,
      title: "Direct quotes",
      body: seller.whatsapp ? "Reply within hours on WhatsApp" : "Call for a quote",
    });
  }
  if (seller.address.city) {
    usps.push({
      icon: Truck,
      title: `Ships from ${seller.address.city}`,
      body: "Bulk and wholesale orders welcome",
    });
  }
  if (seller.certifications.length > 0) {
    usps.push({
      icon: Award,
      title: seller.certifications[0]!,
      body:
        seller.certifications.length > 1
          ? `+${seller.certifications.length - 1} more certifications`
          : "Certified",
    });
  }
  if (seller.employeeCount) {
    usps.push({
      icon: Users,
      title: `${seller.employeeCount} employees`,
      body: "Capacity for large orders",
    });
  }
  return usps.slice(0, 4);
}

export function UspStrip({
  seller,
  variant = "cards",
}: {
  seller: Seller;
  variant?: "cards" | "line" | "band";
}) {
  const usps = uspsFor(seller);
  if (usps.length < 2) return null;

  if (variant === "band") {
    return (
      <section className={`${T.primaryBg}`}>
        <ul className={`${CONTAINER} grid gap-6 py-6 sm:grid-cols-2 lg:grid-cols-4`}>
          {usps.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex items-center gap-3">
              <Icon className="h-7 w-7 shrink-0 opacity-90" aria-hidden="true" />
              <span>
                <span className="block text-sm font-semibold">{title}</span>
                <span className="block text-xs opacity-80">{body}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section className={`${CONTAINER} py-8`}>
      <ul
        className={
          variant === "line"
            ? `grid divide-y border-y ${T.border} sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x`
            : "grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        }
      >
        {usps.map(({ icon: Icon, title, body }) => (
          <li
            key={title}
            className={
              variant === "line"
                ? `flex items-center gap-3 px-4 py-5 ${T.border}`
                : `flex items-center gap-3 border ${T.border} ${T.radius} ${T.surface} p-4`
            }
          >
            <span
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${T.background} ${T.primaryText} ring-1 ring-black/5`}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-semibold">{title}</span>
              <span className="block text-xs opacity-70">{body}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ────────────────────────── products ────────────────────────── */

export function ProductRail({
  products,
  title = "Our products",
  eyebrow,
  description,
  columns = 4,
  variant = "card",
  align,
  surface = false,
  href = "/products",
  limit,
}: {
  products: HomeData["products"];
  title?: string;
  eyebrow?: string;
  description?: string | null;
  columns?: 3 | 4 | 5 | 6;
  variant?: ProductTileVariant;
  align?: "left" | "center";
  /** Render on the surface colour, as a band. */
  surface?: boolean;
  href?: string;
  limit?: number;
}) {
  const items = limit ? products.slice(0, limit) : products;
  if (items.length === 0) return null;

  const cols = {
    3: "sm:grid-cols-2 lg:grid-cols-3",
    4: "sm:grid-cols-2 lg:grid-cols-4",
    5: "sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5",
    6: "sm:grid-cols-3 lg:grid-cols-6",
  }[columns];

  return (
    <section className={surface ? `${T.surface} py-14` : "py-14"}>
      <div className={CONTAINER}>
        <SectionTitle
          title={title}
          eyebrow={eyebrow}
          description={description}
          align={align}
          action={{ href, label: "View all" }}
        />
        <ul className={`grid gap-4 ${variant === "row" ? "sm:grid-cols-2 lg:grid-cols-3" : cols}`}>
          {items.map((product) => (
            <li key={product.id}>
              <ProductTile product={product} variant={variant} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** One hero tile plus a compact list — the "best sellers" band with a lead product. */
export function FeaturedSplit({
  products,
  title = "Best sellers",
  eyebrow,
  surface = true,
}: {
  products: HomeData["products"];
  title?: string;
  eyebrow?: string;
  surface?: boolean;
}) {
  if (products.length < 3) return null;
  const [lead, ...rest] = products;

  return (
    <section className={surface ? `${T.surface} py-14` : "py-14"}>
      <div className={CONTAINER}>
        <SectionTitle
          title={title}
          eyebrow={eyebrow}
          action={{ href: "/products", label: "View all" }}
        />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <ProductTile product={lead!} variant="hero" />
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {rest.slice(0, 4).map((product) => (
              <li key={product.id}>
                <ProductTile product={product} variant="row" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────── promo banners ────────────────────────── */

/**
 * Two or three promo tiles built from featured products (falling back to
 * gallery images). Reference themes fill these with campaign copy; a seller
 * has no campaigns, so the tile is the product itself with a "Get quote".
 */
export function PromoTiles({
  products,
  gallery,
  count = 3,
}: {
  products: HomeData["products"];
  gallery: HomeData["gallery"];
  count?: 2 | 3;
}) {
  const tiles: Array<{ key: string; href: string; image: string; title: string; sub: string }> = [];
  for (const product of products.filter((p) => p.images[0])) {
    if (tiles.length >= count) break;
    tiles.push({
      key: product.id,
      href: `/products/${product.slug}`,
      image: product.images[0]!.url,
      title: product.name,
      sub: product.category?.name ?? "Get a quote",
    });
  }
  for (const item of gallery) {
    if (tiles.length >= count) break;
    tiles.push({
      key: item.id,
      href: "/gallery",
      image: item.url,
      title: item.title ?? "Our work",
      sub: "View gallery",
    });
  }
  if (tiles.length < 2) return null;

  return (
    <section className={`${CONTAINER} py-6`}>
      <ul className={`grid gap-4 ${count === 2 ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
        {tiles.map((tile) => (
          <li key={tile.key}>
            <Link
              href={tile.href}
              className={`group relative block aspect-video overflow-hidden ${T.radius} ${T.surface}`}
            >
              <SiteImage
                src={tile.image}
                alt=""
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <span className="absolute inset-0 bg-linear-to-r from-black/65 via-black/20 to-transparent" />
              <span className="absolute inset-y-0 left-0 flex max-w-[70%] flex-col justify-center p-6 text-white">
                <span className="text-xs font-semibold tracking-wide uppercase opacity-80">
                  {tile.sub}
                </span>
                <span className="site-display mt-1 text-xl font-bold text-balance">
                  {tile.title}
                </span>
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold underline-offset-4 group-hover:underline">
                  Shop now <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ────────────────────────── trust band ────────────────────────── */

/** Business facts as a stats band: established, team, catalogue, certifications. */
export function TrustBand({
  seller,
  counts,
  variant = "dark",
}: {
  seller: Seller;
  counts: HomeData["counts"];
  variant?: "dark" | "brand" | "light";
}) {
  const facts: Array<{ icon: typeof Award; value: string; label: string }> = [];
  if (seller.establishedYear)
    facts.push({ icon: Building2, value: String(seller.establishedYear), label: "Established" });
  if (counts.products > 0)
    facts.push({ icon: BadgeCheck, value: String(counts.products), label: "Products listed" });
  if (seller.employeeCount)
    facts.push({ icon: Users, value: seller.employeeCount, label: "Team members" });
  if (seller.certifications.length > 0)
    facts.push({
      icon: Award,
      value: String(seller.certifications.length),
      label: "Certifications",
    });
  if (seller.address.city)
    facts.push({ icon: MapPin, value: seller.address.city, label: "Based in" });
  if (facts.length < 2) return null;

  const tone =
    variant === "dark"
      ? "bg-neutral-900 text-white"
      : variant === "brand"
        ? T.primaryBg
        : `${T.surface}`;

  return (
    <section className={`${CONTAINER} py-8`}>
      <dl className={`grid gap-8 ${T.radius} ${tone} px-8 py-10 sm:grid-cols-2 lg:grid-cols-4`}>
        {facts.slice(0, 4).map(({ icon: Icon, value, label }) => (
          <div key={label} className="flex items-center gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15">
              <Icon className="h-6 w-6" aria-hidden="true" />
            </span>
            <span>
              <dd className="site-display text-2xl font-bold">{value}</dd>
              <dt className="text-sm opacity-75">{label}</dt>
            </span>
          </div>
        ))}
      </dl>
      {seller.certifications.length > 0 ? (
        <ul className="mt-5 flex flex-wrap justify-center gap-2">
          {seller.certifications.map((cert) => (
            <li
              key={cert}
              className={`border ${T.border} rounded-full px-3 py-1 text-xs font-medium opacity-80`}
            >
              {cert}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/* ────────────────────────── enquiry CTA ────────────────────────── */

export function EnquiryBand({
  seller,
  variant = "brand",
  image,
}: {
  seller: Seller;
  variant?: "brand" | "dark" | "image";
  image?: string | null;
}) {
  const tone = variant === "dark" ? "bg-neutral-900 text-white" : T.primaryBg;
  return (
    <section className={`${CONTAINER} py-10`}>
      <div
        className={`relative overflow-hidden ${T.radius} ${tone} px-8 py-12 text-center lg:px-16`}
      >
        {variant === "image" && image ? (
          <>
            <SiteImage src={image} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <span className="absolute inset-0 bg-black/60" aria-hidden="true" />
          </>
        ) : null}
        <div className="relative text-white">
          <h2 className="text-3xl font-bold tracking-tight text-balance">
            Need a quote or bulk pricing?
          </h2>
          <p className="mx-auto mt-3 max-w-xl opacity-85">
            Tell {seller.businessName} what you need — quantity, specification, delivery city — and
            get a reply straight from the business.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <ContactIntent
              seller={seller}
              className="flex flex-wrap justify-center gap-3"
              whatsappClassName={BTN_WHITE}
              priceClassName={`${BTN_OUTLINE} border-white/40 text-white hover:bg-white/10`}
            />
            {seller.phone ? (
              <a
                href={`tel:${seller.phone}`}
                className={`${BTN_OUTLINE} border-white/40 text-white hover:bg-white/10`}
              >
                <Phone className="h-4 w-4" aria-hidden="true" />
                {seller.phone}
              </a>
            ) : null}
            <Link
              href="/contact"
              className={`${BTN_OUTLINE} border-white/40 text-white hover:bg-white/10`}
            >
              Send an enquiry
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────── about / story ────────────────────────── */

export function StorySplit({
  seller,
  image,
  reverse = false,
}: {
  seller: Seller;
  image?: string | null;
  reverse?: boolean;
}) {
  const text = excerpt(seller.description, 420);
  if (!text) return null;
  return (
    <section className={`${CONTAINER} py-14`}>
      <div
        className={`grid items-center gap-10 lg:grid-cols-2 ${reverse ? "lg:[&>*:first-child]:order-last" : ""}`}
      >
        <div className={`aspect-4/3 overflow-hidden ${T.radius} ${T.surface}`}>
          {image ? <SiteImage src={image} alt="" className="h-full w-full object-cover" /> : null}
        </div>
        <div>
          <p className={`text-xs font-semibold tracking-widest uppercase ${T.accentText}`}>
            About us
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-balance">
            {seller.tagline ?? `Why buyers choose ${seller.businessName}`}
          </h2>
          <p className="mt-4 leading-relaxed opacity-80">{text}</p>
          <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {seller.establishedYear ? (
              <li className="inline-flex items-center gap-1.5">
                <Clock className={`h-4 w-4 ${T.primaryText}`} aria-hidden="true" /> Since{" "}
                {seller.establishedYear}
              </li>
            ) : null}
            {seller.isVerified ? (
              <li className="inline-flex items-center gap-1.5">
                <BadgeCheck className={`h-4 w-4 ${T.primaryText}`} aria-hidden="true" /> Verified
                supplier
              </li>
            ) : null}
            {seller.address.city ? (
              <li className="inline-flex items-center gap-1.5">
                <MapPin className={`h-4 w-4 ${T.primaryText}`} aria-hidden="true" />{" "}
                {seller.address.city}
              </li>
            ) : null}
          </ul>
          <Link href="/about" className={`${BTN_PRIMARY} mt-6`}>
            Read our story
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────── services & gallery ────────────────────────── */

export function ServicesRail({
  services,
  surface = false,
}: {
  services: HomeData["services"];
  surface?: boolean;
}) {
  if (services.length === 0) return null;
  return (
    <section className={surface ? `${T.surface} py-14` : "py-14"}>
      <div className={CONTAINER}>
        <SectionTitle
          title="Services"
          eyebrow="What we do"
          action={{ href: "/services", label: "All services" }}
        />
        <div className={`grid gap-4 ${services.length >= 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
          {services.slice(0, 3).map((service) => (
            <ServiceCard key={service.id} service={service} />
          ))}
        </div>
      </div>
    </section>
  );
}

export function GalleryStrip({
  gallery,
  title = "From our workshop",
  variant = "strip",
}: {
  gallery: HomeData["gallery"];
  title?: string;
  variant?: "strip" | "mosaic";
}) {
  if (gallery.length < 3) return null;
  const items = gallery.slice(0, variant === "mosaic" ? 5 : 6);
  return (
    <section className="py-14">
      <div className={CONTAINER}>
        <SectionTitle
          title={title}
          eyebrow="Gallery"
          align="center"
          action={{ href: "/gallery", label: "See all photos" }}
        />
      </div>
      <ul
        className={
          variant === "mosaic"
            ? `${CONTAINER} grid grid-cols-2 gap-3 md:grid-cols-4 md:[&>li:first-child]:col-span-2 md:[&>li:first-child]:row-span-2`
            : "grid grid-cols-3 gap-1 md:grid-cols-6"
        }
      >
        {items.map((item) => (
          <li
            key={item.id}
            className={`overflow-hidden ${variant === "mosaic" ? T.radius : ""} ${T.surface} aspect-square`}
          >
            <Link href="/gallery" className="block h-full w-full">
              <SiteImage
                src={item.url}
                alt={item.alt ?? ""}
                className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ────────────────────────── contact strip ────────────────────────── */

export function ContactStrip({ seller }: { seller: Seller }) {
  const locality = [seller.address.city, seller.address.state].filter(Boolean).join(", ");
  return (
    <section className={`border-y ${T.border} ${T.surface}`}>
      <div
        className={`${CONTAINER} flex flex-wrap items-center justify-between gap-4 py-5 text-sm`}
      >
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {seller.phone ? (
            <a href={`tel:${seller.phone}`} className="inline-flex items-center gap-2 font-medium">
              <Phone className={`h-4 w-4 ${T.primaryText}`} aria-hidden="true" />
              {seller.phone}
            </a>
          ) : null}
          {locality ? (
            <span className="inline-flex items-center gap-2 opacity-80">
              <MapPin className={`h-4 w-4 ${T.primaryText}`} aria-hidden="true" />
              {locality}
            </span>
          ) : null}
        </div>
        <ContactIntent seller={seller} show="whatsapp" priceClassName={BTN_PRIMARY} />
      </div>
    </section>
  );
}
