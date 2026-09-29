import Link from "next/link";
import { SellerResultCard } from "@/components/marketplace/ResultCards";
import type { SellerHit } from "@/lib/search/types";
import type { FaqItem } from "@/lib/validation/seo";

/**
 * Category page sections below the product grid (D44): suppliers, cities and
 * buyer questions. Each renders nothing when it has nothing real to show — no
 * placeholder copy, no invented FAQs.
 */

export function CategorySuppliers({
  categoryName,
  categoryPath,
  sellers,
  total,
}: {
  categoryName: string;
  categoryPath: string;
  sellers: SellerHit[];
  total: number;
}) {
  if (sellers.length === 0) return null;

  // Split manufacturers out only when both groups are big enough to be worth
  // a heading each; otherwise one list reads better.
  const manufacturers = sellers.filter((seller) => seller.businessType === "MANUFACTURER");
  const others = sellers.filter((seller) => seller.businessType !== "MANUFACTURER");
  const split = manufacturers.length >= 2 && others.length >= 2;
  const groups = split
    ? [
        { title: `${categoryName} manufacturers`, items: manufacturers },
        { title: `${categoryName} suppliers, wholesalers and traders`, items: others },
      ]
    : [{ title: `${categoryName} suppliers`, items: sellers }];

  return (
    <section className="mt-14" aria-labelledby="category-suppliers">
      {groups.map((group, index) => (
        <div key={group.title} className={index > 0 ? "mt-10" : ""}>
          <h2
            id={index === 0 ? "category-suppliers" : undefined}
            className="mb-4 text-lg font-semibold"
          >
            {group.title}
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {group.items.map((seller) => (
              <SellerResultCard key={seller.id} hit={seller} />
            ))}
          </div>
        </div>
      ))}
      {total > sellers.length ? (
        <p className="mt-4 text-sm">
          <Link
            href={`/sellers?category=${encodeURIComponent(categoryPath)}`}
            className="underline underline-offset-2"
          >
            See all {total} {categoryName} suppliers
          </Link>
        </p>
      ) : null}
    </section>
  );
}

export function CategoryCities({
  categoryName,
  categoryPath,
  cities,
}: {
  categoryName: string;
  categoryPath: string;
  cities: Array<{ id: string; slug: string; name: string; sellerCount: number }>;
}) {
  if (cities.length === 0) return null;
  return (
    <section className="mt-14" aria-labelledby="category-cities">
      <h2 id="category-cities" className="mb-4 text-lg font-semibold">
        {categoryName} suppliers by city
      </h2>
      <ul className="flex flex-wrap gap-2">
        {cities.map((city) => (
          <li key={city.id}>
            <Link
              href={`/${city.slug}/category${categoryPath}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 px-3.5 py-1.5 text-sm hover:bg-neutral-50"
            >
              {categoryName} in {city.name}
              <span className="text-xs text-neutral-500 tabular-nums">{city.sellerCount}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CategoryFaqs({ faqs }: { faqs: FaqItem[] }) {
  if (faqs.length === 0) return null;
  return (
    <section className="mt-14 max-w-3xl" aria-labelledby="category-faqs">
      <h2 id="category-faqs" className="mb-4 text-lg font-semibold">
        Questions buyers ask
      </h2>
      <div className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
        {faqs.map((faq) => (
          <details key={faq.q} className="group px-4 py-3">
            <summary className="cursor-pointer list-none font-medium marker:hidden">
              <span className="mr-2 inline-block text-neutral-400 transition-transform group-open:rotate-90">
                ▸
              </span>
              {faq.q}
            </summary>
            <p className="mt-2 leading-relaxed whitespace-pre-line text-neutral-700">{faq.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
