import Link from "next/link";
import { ChevronDown, FileText, LayoutGrid, Store } from "lucide-react";
import { BrandLogo } from "@/components/shared/BrandLogo";
import { SearchBar } from "@/components/marketplace/SearchBar";
import { AccountMenu } from "@/components/marketplace/AccountMenu";
import { getAllCities, getRootCategories } from "@/server/services/taxonomy.service";

/**
 * Marketplace header — two tiers, the way B2B buyers expect them:
 *
 *   ┌ logo ─ [ city ▾ | search ………………… Search ] ─ Post requirement ─ Sell ─ Sign in ┐
 *   └ All categories ▾ ─ Electronics ─ Industrial ─ … ─ Browse by city ─────────────┘
 *
 * Search is the dominant element on every page, not just the homepage,
 * because the majority of buyer sessions start with a query. The green
 * "Post requirement" is the one conversion the whole system feeds
 * (docs/LEADS.md) and is therefore the only filled button on the row.
 *
 * Server component: categories and cities come from the long-lived taxonomy
 * cache, so this costs nothing per request and keeps every page ISR-able.
 */
export async function SiteHeader() {
  const [categories, cities] = await Promise.all([getRootCategories(), getAllCities()]);
  const cityOptions = cities.map((city) => ({ path: city.path, name: city.name }));

  return (
    <header className="shadow-brand-900/5 sticky top-0 z-40 bg-white shadow-sm">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <BrandLogo height={38} priority />

        <div className="order-last w-full lg:order-none lg:w-auto lg:flex-1">
          <SearchBar
            cities={cityOptions}
            id="header-search"
            placeholder="What are you looking for?"
          />
        </div>

        <nav aria-label="Primary" className="ml-auto flex items-center gap-2 text-sm">
          <Link
            href="/post-requirement"
            className="bg-accent-600 hover:bg-accent-700 inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 font-semibold text-white shadow-sm transition-colors"
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            Post requirement
          </Link>
          <Link
            href="/register"
            className="border-brand-200 text-brand-800 hover:border-brand-400 hover:bg-brand-50 hidden items-center gap-1.5 rounded-lg border px-3.5 py-2 font-medium transition-colors sm:inline-flex"
          >
            <Store className="h-4 w-4" aria-hidden="true" />
            Sell on Bzaro
          </Link>
          <AccountMenu />
        </nav>
      </div>

      <div className="bg-brand-900 border-t border-neutral-200 text-white">
        <nav
          aria-label="Categories"
          className="mx-auto flex max-w-7xl [scrollbar-width:none] items-center gap-1 overflow-x-auto px-4 text-sm"
        >
          <Link
            href="/search"
            className="bg-brand-950/60 hover:bg-brand-950 inline-flex shrink-0 items-center gap-2 px-4 py-2.5 font-semibold"
          >
            <LayoutGrid className="h-4 w-4" aria-hidden="true" />
            All categories
            <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
          </Link>
          {categories.slice(0, 8).map((category) => (
            <Link
              key={category.id}
              href={`/category${category.path}`}
              className="text-brand-100 hover:bg-brand-800 shrink-0 px-3 py-2.5 transition-colors hover:text-white"
            >
              {category.name}
            </Link>
          ))}
          <Link
            href="/sellers"
            className="text-brand-100 hover:bg-brand-800 ml-auto shrink-0 px-3 py-2.5 transition-colors hover:text-white"
          >
            Supplier directory
          </Link>
        </nav>
      </div>
    </header>
  );
}
