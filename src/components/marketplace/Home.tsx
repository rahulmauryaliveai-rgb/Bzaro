import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  ClipboardList,
  Globe2,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  Tags,
  Wallet,
} from "lucide-react";
import { SearchBar } from "@/components/marketplace/SearchBar";
import type { getPlatformStats } from "@/server/services/discovery.service";

/**
 * Homepage sections. Modelled on the "B2B Wholesale" reference the client
 * chose: two-tone headline with real product imagery, a trust strip under the
 * fold, image category tiles, a four-step "how it works", a dark stats band,
 * a seller CTA and an FAQ. Every number rendered here is a live count from
 * `getPlatformStats()`; there are no invented testimonials or figures.
 *
 * Server components throughout — nothing reads a cookie, so the page stays
 * ISR (see page.tsx).
 */

type Stats = Awaited<ReturnType<typeof getPlatformStats>>;

export type HeroImage = { url: string; alt: string; href: string };

const formatCount = (n: number) => new Intl.NumberFormat("en-IN").format(n);

/* ───────────────────────────── hero ───────────────────────────── */

export function HomeHero({
  stats,
  cities,
  images,
  popularCategories,
}: {
  stats: Stats;
  cities: Array<{ path: string; name: string }>;
  images: HeroImage[];
  popularCategories: Array<{ id: string; name: string; path: string }>;
}) {
  return (
    <section className="from-brand-50 relative overflow-hidden bg-linear-to-b via-white to-white">
      {/* soft brand glow behind the collage */}
      <div
        aria-hidden="true"
        className="bg-brand-100/60 pointer-events-none absolute -top-40 right-[-10%] h-[36rem] w-[36rem] rounded-full blur-3xl"
      />
      <div
        aria-hidden="true"
        className="bg-accent-100/60 pointer-events-none absolute -bottom-40 left-[-10%] h-[28rem] w-[28rem] rounded-full blur-3xl"
      />

      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 pt-12 pb-16 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:pt-16 lg:pb-20">
        <div className="min-w-0">
          <p className="border-accent-200 bg-accent-50 text-accent-800 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold tracking-wide uppercase">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            India&apos;s B2B marketplace
          </p>

          <h1 className="mt-5 text-4xl font-bold tracking-tight text-balance text-neutral-900 sm:text-5xl lg:text-[3.4rem] lg:leading-[1.08]">
            Find verified suppliers for{" "}
            <span className="from-brand-700 to-accent-600 bg-linear-to-r bg-clip-text text-transparent">
              everything your business buys
            </span>
          </h1>

          <p className="mt-5 max-w-xl text-lg text-neutral-600">
            Compare products from{" "}
            <strong className="font-semibold text-neutral-900 tabular-nums">
              {formatCount(stats.sellers)}
            </strong>{" "}
            GST-verified businesses across{" "}
            <strong className="font-semibold text-neutral-900 tabular-nums">
              {formatCount(stats.cities)}
            </strong>{" "}
            cities. Get quotes on WhatsApp — free for buyers.
          </p>

          <div className="mt-8">
            <SearchBar
              size="lg"
              cities={cities}
              id="hero-search"
              placeholder="Try “LED bulbs”, “packaging boxes”, “CNC machining”…"
            />
          </div>

          {popularCategories.length > 0 ? (
            <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-500">
              <span>Popular:</span>
              {popularCategories.slice(0, 5).map((category) => (
                <Link
                  key={category.id}
                  href={`/category${category.path}`}
                  className="hover:text-brand-700 hover:ring-brand-300 rounded-full bg-white/70 px-2.5 py-0.5 text-neutral-700 ring-1 ring-neutral-200 transition-colors"
                >
                  {category.name}
                </Link>
              ))}
            </p>
          ) : null}

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/post-requirement"
              className="bg-accent-600 shadow-accent-600/25 hover:bg-accent-700 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-base font-semibold text-white shadow-lg transition-all hover:-translate-y-0.5"
            >
              <ClipboardList className="h-5 w-5" aria-hidden="true" />
              Post your requirement
            </Link>
            <Link
              href="/sellers"
              className="border-brand-200 text-brand-800 hover:border-brand-400 hover:bg-brand-50 inline-flex items-center gap-2 rounded-xl border bg-white px-5 py-3 text-base font-medium transition-colors"
            >
              Browse suppliers
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-neutral-600">
            {[
              "GST-verified suppliers",
              "Quotes from up to 10 suppliers",
              "Free for buyers, no account needed",
            ].map((item) => (
              <li key={item} className="inline-flex items-center gap-1.5">
                <BadgeCheck className="text-accent-600 h-4 w-4" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <HeroCollage images={images} stats={stats} />
      </div>
    </section>
  );
}

function HeroCollage({ images, stats }: { images: HeroImage[]; stats: Stats }) {
  // One tall tile and two squares: balanced at any count from 0 to 3, and the
  // empties are brand-tinted panels rather than holes.
  const tiles = images.slice(0, 3);
  const layout = ["row-span-2 aspect-3/4", "aspect-square", "aspect-square"];

  return (
    <div className="relative hidden lg:block">
      <div className="grid grid-cols-2 gap-4">
        {tiles.map((image, index) => (
          <Link
            key={image.href}
            href={image.href}
            className={`group shadow-brand-900/10 relative overflow-hidden rounded-2xl bg-neutral-100 shadow-lg ring-1 ring-black/5 ${layout[index]}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.url}
              alt={image.alt}
              loading={index === 0 ? "eager" : "lazy"}
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          </Link>
        ))}
        {tiles.length < 3
          ? Array.from({ length: 3 - tiles.length }).map((_, index) => (
              <div
                key={`placeholder-${index}`}
                className={`from-brand-100 to-brand-50 ring-brand-100 rounded-2xl bg-linear-to-br ring-1 ${layout[tiles.length + index]}`}
              />
            ))
          : null}
      </div>

      <div className="shadow-brand-900/15 absolute -bottom-6 -left-6 flex items-center gap-3 rounded-2xl bg-white p-4 shadow-xl ring-1 ring-black/5">
        <span className="bg-accent-50 text-accent-700 flex h-11 w-11 items-center justify-center rounded-xl">
          <ShieldCheck className="h-6 w-6" aria-hidden="true" />
        </span>
        <div>
          <p className="text-xl font-bold text-neutral-900 tabular-nums">
            {formatCount(stats.sellers)}
          </p>
          <p className="text-xs text-neutral-500">verified suppliers</p>
        </div>
      </div>

      <div className="shadow-brand-900/15 absolute -top-4 -right-4 flex items-center gap-3 rounded-2xl bg-white p-4 shadow-xl ring-1 ring-black/5">
        <span className="bg-brand-50 text-brand-700 flex h-11 w-11 items-center justify-center rounded-xl">
          <Package className="h-6 w-6" aria-hidden="true" />
        </span>
        <div>
          <p className="text-xl font-bold text-neutral-900 tabular-nums">
            {formatCount(stats.products)}
          </p>
          <p className="text-xs text-neutral-500">products listed</p>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── trust strip ─────────────────────────── */

const USPS = [
  {
    icon: ShieldCheck,
    title: "Verified suppliers",
    body: "GSTIN and business details checked before a seller goes live.",
  },
  {
    icon: MessageCircle,
    title: "Direct on WhatsApp",
    body: "Talk to the supplier, not a call centre. Numbers are shared, not hidden.",
  },
  {
    icon: Tags,
    title: "Compare quotes",
    body: "One requirement reaches up to 10 matched suppliers in your city.",
  },
  {
    icon: Wallet,
    title: "Free for buyers",
    body: "No commission, no account. Suppliers pay only for the leads they accept.",
  },
] as const;

export function TrustStrip() {
  return (
    <section aria-label="Why buy on Bzaro" className="border-y border-neutral-200 bg-white">
      <ul className="mx-auto grid max-w-7xl divide-y divide-neutral-200 px-4 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
        {USPS.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex gap-3 py-5 lg:px-5 lg:first:pl-0 lg:last:pr-0">
            <span className="bg-brand-50 text-brand-700 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="font-semibold text-neutral-900">{title}</p>
              <p className="mt-0.5 text-sm text-neutral-600">{body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ─────────────────────────── how it works ─────────────────────────── */

const STEPS = [
  {
    icon: Search,
    title: "Search or post a requirement",
    body: "Tell us the product, quantity and city. Takes under a minute.",
  },
  {
    icon: ShieldCheck,
    title: "We match verified suppliers",
    body: "Up to 10 suppliers in your category and city receive your requirement.",
  },
  {
    icon: MessageCircle,
    title: "Get quotes on WhatsApp",
    body: "Suppliers reply directly. Compare prices, MOQs and delivery.",
  },
  {
    icon: BadgeCheck,
    title: "Choose and close the deal",
    body: "Negotiate and buy on your terms — Bzaro never sits in the middle.",
  },
] as const;

export function HowItWorks() {
  return (
    <section>
      <SectionHeading
        eyebrow="How it works"
        title="From requirement to quotes in four steps"
        description="No signup, no calls from us. Just suppliers who can actually deliver."
      />
      <ol className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map(({ icon: Icon, title, body }, index) => (
          <li
            key={title}
            className="hover:shadow-brand-900/5 relative rounded-2xl border border-neutral-200 bg-white p-6 transition-shadow hover:shadow-lg"
          >
            <span className="text-brand-100 absolute top-5 right-5 text-4xl font-bold tabular-nums">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="bg-brand-700 flex h-11 w-11 items-center justify-center rounded-xl text-white">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <h3 className="mt-4 font-semibold text-neutral-900">{title}</h3>
            <p className="mt-1.5 text-sm text-neutral-600">{body}</p>
          </li>
        ))}
      </ol>
      <div className="mt-8 text-center">
        <Link
          href="/post-requirement"
          className="bg-accent-600 shadow-accent-600/25 hover:bg-accent-700 inline-flex items-center gap-2 rounded-xl px-6 py-3 font-semibold text-white shadow-lg transition-all hover:-translate-y-0.5"
        >
          <ClipboardList className="h-5 w-5" aria-hidden="true" />
          Post a requirement — it&apos;s free
        </Link>
      </div>
    </section>
  );
}

/* ─────────────────────────── stats band ─────────────────────────── */

export function StatsBand({ stats }: { stats: Stats }) {
  const items = [
    { icon: Building2, value: stats.sellers, label: "Verified suppliers" },
    { icon: Package, value: stats.products, label: "Products listed" },
    { icon: Tags, value: stats.categories, label: "Categories" },
    { icon: MapPin, value: stats.cities, label: "Cities covered" },
  ];
  return (
    <section
      aria-label="Bzaro in numbers"
      className="bg-brand-900 relative overflow-hidden rounded-3xl text-white"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(30,164,79,0.35),transparent_55%)]"
      />
      <dl className="relative grid gap-8 px-6 py-10 sm:grid-cols-2 lg:grid-cols-4 lg:px-12">
        {items.map(({ icon: Icon, value, label }) => (
          <div key={label} className="flex items-center gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10">
              <Icon className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <dd className="text-3xl font-bold tabular-nums">{formatCount(value)}</dd>
              <dt className="text-brand-100 text-sm">{label}</dt>
            </div>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* ─────────────────────────── seller CTA ─────────────────────────── */

export function SellerCta() {
  const perks = [
    "Free listing with a shareable catalogue page — upgrade for your own website",
    "Buyer requirements delivered to your dashboard and WhatsApp",
    "Pay only for the leads you accept",
  ];
  return (
    <section className="border-accent-200 from-accent-50 to-brand-50 grid items-center gap-8 rounded-3xl border bg-linear-to-br via-white p-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:p-12">
      <div>
        <p className="text-accent-800 inline-flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
          <Store className="h-4 w-4" aria-hidden="true" />
          For suppliers
        </p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight text-balance text-neutral-900">
          Sell to businesses across India — start free
        </h2>
        <p className="mt-3 max-w-xl text-neutral-600">
          List your products once. Buyers find you on Bzaro, through matched requirements in your
          category and city, and — on Gold — on Google through a website of your own.
        </p>
        <ul className="mt-5 space-y-2 text-sm text-neutral-700">
          {perks.map((perk) => (
            <li key={perk} className="flex items-start gap-2">
              <BadgeCheck className="text-accent-600 mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {perk}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-3 lg:items-end">
        <Link
          href="/register"
          className="bg-brand-700 shadow-brand-900/20 hover:bg-brand-600 inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-base font-semibold text-white shadow-lg transition-all hover:-translate-y-0.5"
        >
          <Globe2 className="h-5 w-5" aria-hidden="true" />
          List your business free
        </Link>
        <Link
          href="/login"
          className="text-brand-800 inline-flex items-center justify-center gap-1 text-sm font-medium hover:underline"
        >
          Already a seller? Sign in
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

/* ─────────────────────────── FAQ ─────────────────────────── */

const FAQ = [
  {
    q: "Is Bzaro free for buyers?",
    a: "Yes. Searching, contacting suppliers and posting a requirement are free. You only verify your mobile number once so suppliers can reach you.",
  },
  {
    q: "How are suppliers verified?",
    a: "A supplier goes live only after our team reviews their business details and GSTIN. Verified suppliers carry the green badge on every listing.",
  },
  {
    q: "What happens after I post a requirement?",
    a: "The supplier you picked (if any) gets it immediately on WhatsApp. Up to 10 other verified suppliers in the same category and city receive it in their dashboard and reply to you directly.",
  },
  {
    q: "Does Bzaro take a commission?",
    a: "No. Deals happen directly between you and the supplier. Suppliers pay a small per-lead fee for the requirements they choose to accept.",
  },
  {
    q: "How do I list my business?",
    a: "Register with your mobile number, add your business details and categories, then your products. Your catalogue page and buyer leads go live the same day; a Gold plan adds a website of your own.",
  },
] as const;

/** Platform support line for "Book a 10 min call" — the operator's own number, not a seller's. */
const SUPPORT_PHONE = "+919999171512";
const SUPPORT_PHONE_DISPLAY = "+91 99991 71512";
const SUPPORT_WHATSAPP = `https://wa.me/${SUPPORT_PHONE.replace(/\D/g, "")}?text=${encodeURIComponent(
  "Hi Bzaro, I'd like to book a 10 minute call.",
)}`;

export function Faq() {
  return (
    <section className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-12">
      <div>
        <p className="text-accent-700 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
          <span aria-hidden="true" className="bg-accent-600 h-2 w-2 rounded-full" />
          FAQs
        </p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight text-balance text-neutral-900 sm:text-4xl">
          Frequently Asked Questions
        </h2>

        {/* Book a call — the operator's WhatsApp, not a seller's (LEADS §1 does not apply). */}
        <div className="mt-8 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <span className="bg-brand-50 ring-brand-100 flex h-16 w-16 items-center justify-center rounded-full ring-4">
            <Image src="/brand/bzaro-mark.png" alt="" width={36} height={36} />
          </span>
          <h3 className="mt-4 text-xl font-bold tracking-tight text-neutral-900">
            Book a 10 min call
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-neutral-600">
            Have a question before listing your business or posting a requirement? Chat with our
            team on WhatsApp and we&rsquo;ll set up a quick 10-minute call at a time that suits you.
          </p>
          <a
            href={SUPPORT_WHATSAPP}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-accent-600 shadow-accent-600/25 hover:bg-accent-700 mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold text-white shadow-lg transition-all hover:-translate-y-0.5"
          >
            <MessageCircle className="h-5 w-5" aria-hidden="true" />
            Chat on WhatsApp
          </a>
          <a
            href={`tel:${SUPPORT_PHONE}`}
            className="mt-3 flex items-center justify-center gap-2 text-sm font-medium text-neutral-600 hover:text-neutral-900"
          >
            <Phone className="h-4 w-4" aria-hidden="true" />
            {SUPPORT_PHONE_DISPLAY}
          </a>
        </div>
      </div>

      <div className="space-y-3">
        {FAQ.map(({ q, a }, index) => (
          <details
            key={q}
            open={index === 0}
            className="group rounded-2xl border border-neutral-200 bg-white px-6 py-4 open:shadow-sm"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-neutral-900 marker:hidden">
              {q}
              <span
                aria-hidden="true"
                className="bg-brand-50 text-brand-700 group-open:bg-accent-600 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-lg leading-none transition-all group-open:rotate-45 group-open:text-white"
              >
                +
              </span>
            </summary>
            <p className="mt-3 pr-10 text-sm leading-relaxed text-neutral-600">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────── shared ─────────────────────────── */

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  as: Tag = "h2",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: { href: string; label: string };
  as?: "h2" | "h3";
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow ? (
          <p className="text-accent-700 text-xs font-semibold tracking-wide uppercase">{eyebrow}</p>
        ) : null}
        <Tag className="mt-1 text-2xl font-bold tracking-tight text-balance text-neutral-900 sm:text-3xl">
          {title}
        </Tag>
        {description ? <p className="mt-2 max-w-2xl text-neutral-600">{description}</p> : null}
      </div>
      {action ? (
        <Link
          href={action.href}
          className="text-brand-700 inline-flex items-center gap-1 text-sm font-medium hover:underline"
        >
          {action.label}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}
