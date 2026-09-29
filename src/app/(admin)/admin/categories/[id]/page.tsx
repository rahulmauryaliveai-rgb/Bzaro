import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { getCategoryForSeo } from "@/server/services/admin-taxonomy.service";
import { categorySeoDescription, categorySeoTitle } from "@/lib/seo/templates";
import { parseFaqs } from "@/lib/validation/seo";
import { marketplaceUrl } from "@/lib/utils/url";
import { CategorySeoForm } from "@/components/admin/CategorySeoForm";

/**
 * SEO and page content for one category (D44).
 *
 * Every field is optional: left blank, the page uses the shared templates in
 * src/lib/seo/templates.ts, shown here as the placeholder so the admin sees
 * exactly what they would be replacing.
 */

type Props = { params: Promise<{ id: string }> };

export default async function AdminCategorySeoPage({ params }: Props) {
  await requirePermission("admin:taxonomy:manage");
  const { id } = await params;
  const category = await getCategoryForSeo(id);
  if (!category) notFound();

  const defaults = {
    title: categorySeoTitle({ name: category.name }),
    description: categorySeoDescription({
      name: category.name,
      productCount: category.productCount,
    }),
  };

  return (
    <div className="max-w-3xl">
      <Link href="/admin/categories" className="text-sm text-neutral-400 hover:text-neutral-200">
        ← Categories
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{category.name}</h1>
      <p className="mt-1 text-sm text-neutral-400">
        <a
          href={marketplaceUrl(`/category${category.path}`)}
          className="font-mono underline underline-offset-2"
          target="_blank"
          rel="noreferrer"
        >
          /category{category.path}
        </a>{" "}
        · {category.productCount} products · {category.sellerCount} sellers
        {category.isActive ? "" : " · inactive"}
      </p>

      <div className="mt-6 rounded-lg border border-neutral-700 bg-neutral-800/60 p-4 text-sm text-neutral-300">
        <p className="font-medium text-neutral-100">How to write for this page</p>
        <p className="mt-1">
          Write for a buyer who landed here from Google. Say what the category covers, what buyers
          usually compare (sizes, grades, MOQ, lead time) and which cities have suppliers. No
          keyword lists, no &quot;best/#1&quot; claims, nothing copied from other sites. An empty
          category stays out of Google automatically until something is listed in it.
        </p>
      </div>

      <CategorySeoForm
        category={{
          id: category.id,
          metaTitle: category.metaTitle ?? "",
          metaDescription: category.metaDescription ?? "",
          description: category.description ?? "",
          ogImageUrl: category.ogImageUrl ?? "",
          noindex: category.noindex,
          faqs: parseFaqs(category.faqs),
        }}
        defaults={defaults}
      />
    </div>
  );
}
