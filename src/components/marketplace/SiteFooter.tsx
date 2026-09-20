import Link from "next/link";
import { BrandLogo } from "@/components/shared/BrandLogo";
import { clientEnv } from "@/env.client";
import { getPopularCities, getRootCategories } from "@/server/services/taxonomy.service";

/**
 * Marketplace footer: the crawlable index of the site (categories, cities,
 * both entry points) plus the brand block. Everything in it is a real page;
 * there are no placeholder links waiting for a future feature.
 */
export async function SiteFooter() {
  const [categories, cities] = await Promise.all([getRootCategories(), getPopularCities(10)]);
  const platform = clientEnv.NEXT_PUBLIC_PLATFORM_NAME;

  return (
    <footer className="mt-16 border-t border-neutral-200 bg-neutral-50">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <BrandLogo variant="full" height={56} />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-neutral-600">
            {platform} connects Indian buyers with verified manufacturers, wholesalers and service
            providers. Every supplier gets a verified listing; every buyer gets quotes from
            suppliers who can actually deliver.
          </p>
        </div>

        <FooterColumn title="For buyers">
          <FooterLink href="/search">Search products</FooterLink>
          <FooterLink href="/sellers">Supplier directory</FooterLink>
          <FooterLink href="/post-requirement">Post a requirement</FooterLink>
          <FooterLink href="/products">Latest products</FooterLink>
        </FooterColumn>

        <FooterColumn title="For sellers">
          <FooterLink href="/register">List your business</FooterLink>
          <FooterLink href="/pricing">Pricing &amp; plans</FooterLink>
          <FooterLink href="/login">Seller login</FooterLink>
        </FooterColumn>

        <FooterColumn title="Top categories">
          {categories.slice(0, 6).map((category) => (
            <FooterLink key={category.id} href={`/category${category.path}`}>
              {category.name}
            </FooterLink>
          ))}
        </FooterColumn>
      </div>

      {cities.length > 0 ? (
        <div className="border-t border-neutral-200">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 text-xs text-neutral-500">
            <span className="font-medium text-neutral-700">Suppliers by city:</span>
            {cities.map((city) => (
              <Link key={city.id} href={`/${city.slug}`} className="hover:text-brand-700">
                {city.name}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div className="border-t border-neutral-200">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-neutral-500">
          <span>
            © {new Date().getFullYear()} {platform}. All rights reserved.
          </span>
          <span>Made for Indian businesses.</span>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-sm font-semibold tracking-wide text-neutral-900 uppercase">{title}</h2>
      <ul className="mt-3 space-y-2 text-sm">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="hover:text-brand-700 text-neutral-600 transition-colors">
        {children}
      </Link>
    </li>
  );
}
