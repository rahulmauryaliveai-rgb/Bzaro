import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublishedPost, getRelatedPosts } from "@/server/services/blog.service";
import { RichText } from "@/components/shared/RichText";
import { RelatedArticles, formatBlogDate } from "@/components/blog/BlogCards";
import { MarketplaceBreadcrumbs } from "@/components/marketplace/ResultsPagination";
import { PostRequirementCta } from "@/components/marketplace/Discovery";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd, blogPostingJsonLd } from "@/lib/seo/jsonld";
import { clip } from "@/lib/seo/templates";
import { inlineToText, parseRich, stripRich, wordCount } from "@/lib/text/rich";
import { readingMinutes } from "@/lib/validation/blog";
import { marketplaceUrl } from "@/lib/utils/url";

/**
 * A blog article (D45).
 *
 * Built for the reader first: who wrote it and when, a table of contents for
 * long guides, then the listings the article is about — the categories,
 * products and suppliers the author tagged — so a buyer who has just learnt
 * what to look for can act on it. Links are the author's choice; nothing is
 * auto-inserted.
 */

export const revalidate = 3600;

type Props = { params: Promise<{ slug: string }> };

const DAY = 86_400_000;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedPost(slug);
  if (!post) return { title: "Article not found", robots: { index: false, follow: false } };

  const url = marketplaceUrl(`/blog/${post.slug}`);
  const description =
    post.metaDescription ?? post.excerpt ?? clip(stripRich(post.body, { article: true }));
  const image = post.ogImageUrl ?? post.coverImageUrl;

  return {
    title: post.metaTitle ?? post.title,
    description,
    alternates: { canonical: post.canonicalUrl ?? url },
    robots: post.noindex ? { index: false, follow: true } : { index: true, follow: true },
    authors: post.author
      ? [{ name: post.author.name, url: marketplaceUrl(`/blog/author/${post.author.slug}`) }]
      : undefined,
    openGraph: {
      type: "article",
      title: post.metaTitle ?? post.title,
      description,
      url,
      publishedTime: post.publishedAt?.toISOString(),
      modifiedTime: post.updatedAt.toISOString(),
      authors: post.author ? [post.author.name] : undefined,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export default async function BlogArticlePage({ params }: Props) {
  const { slug } = await params;
  const post = await getPublishedPost(slug);
  if (!post) notFound();

  const related = await getRelatedPosts(post.id, post.categoryIds, 3);
  const url = marketplaceUrl(`/blog/${post.slug}`);
  const minutes = readingMinutes(wordCount(post.body, { article: true }));
  const headings = parseRich(post.body, { article: true }).flatMap((block) =>
    block.type === "heading" && block.level === 2
      ? [{ id: block.id, text: inlineToText(block.children) }]
      : [],
  );
  const updated =
    post.publishedAt && post.updatedAt.getTime() - post.publishedAt.getTime() > DAY
      ? post.updatedAt
      : null;

  const trail = [
    { href: "/", label: "Home" },
    { href: "/blog", label: "Guides" },
    { href: `/blog/${post.slug}`, label: post.title },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <JsonLd
        data={[
          blogPostingJsonLd({
            url,
            headline: post.title,
            description:
              post.metaDescription ?? post.excerpt ?? clip(stripRich(post.body, { article: true })),
            image: post.ogImageUrl ?? post.coverImageUrl,
            datePublished: post.publishedAt,
            dateModified: post.updatedAt,
            authorName: post.author?.name ?? null,
            authorUrl: post.author ? marketplaceUrl(`/blog/author/${post.author.slug}`) : null,
            publisherId: marketplaceUrl("/#organization"),
            wordCount: wordCount(post.body, { article: true }),
          }),
          breadcrumbJsonLd(trail, marketplaceUrl()),
        ]}
      />
      <MarketplaceBreadcrumbs trail={trail} />

      <article className="mx-auto max-w-3xl">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {post.title}
          </h1>
          {post.excerpt ? <p className="mt-3 text-lg text-neutral-600">{post.excerpt}</p> : null}
          <p className="mt-4 text-sm text-neutral-500">
            {post.author ? (
              <>
                By{" "}
                <Link
                  href={`/blog/author/${post.author.slug}`}
                  className="font-medium text-neutral-800 hover:underline"
                >
                  {post.author.name}
                </Link>
                {" · "}
              </>
            ) : null}
            <time dateTime={post.publishedAt?.toISOString()}>
              {formatBlogDate(post.publishedAt)}
            </time>
            {updated ? (
              <>
                {" · Updated "}
                <time dateTime={updated.toISOString()}>{formatBlogDate(updated)}</time>
              </>
            ) : null}
            {` · ${minutes} min read`}
          </p>
        </header>

        {post.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.coverImageUrl}
            alt={post.coverImageAlt ?? ""}
            className="mt-8 aspect-video w-full rounded-xl object-cover"
            fetchPriority="high"
            decoding="async"
          />
        ) : null}

        {headings.length >= 3 ? (
          <nav
            aria-label="In this guide"
            className="mt-8 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm"
          >
            <p className="font-medium text-neutral-900">In this guide</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-neutral-700">
              {headings.map((heading) => (
                <li key={heading.id}>
                  <a href={`#${heading.id}`} className="hover:underline">
                    {heading.text}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}

        <RichText
          text={post.body}
          article
          className="mt-8 space-y-5 text-[17px] leading-relaxed text-neutral-800"
        />

        {post.categories.length + post.products.length + post.sellers.length > 0 ? (
          <aside
            aria-labelledby="in-this-article"
            className="mt-12 rounded-xl border border-neutral-200 p-5"
          >
            <h2 id="in-this-article" className="text-lg font-semibold">
              Find suppliers
            </h2>
            {post.categories.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {post.categories.map((category) => (
                  <li key={category.id}>
                    <Link
                      href={`/category${category.path}`}
                      className="inline-block rounded-full border border-neutral-300 px-3.5 py-1.5 text-sm hover:bg-neutral-50"
                    >
                      {category.name} suppliers
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
            {post.products.length > 0 ? (
              <ul className="mt-5 grid gap-4 sm:grid-cols-2">
                {post.products.map((product) => (
                  <li key={product.id}>
                    <Link
                      href={`/product/${product.seller.slug}/${product.slug}`}
                      className="flex items-center gap-3 rounded-lg border border-neutral-200 p-2 hover:bg-neutral-50"
                    >
                      <span className="h-14 w-14 shrink-0 overflow-hidden rounded bg-neutral-100">
                        {product.images[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={product.images[0].url}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </span>
                      <span className="min-w-0 text-sm">
                        <span className="block truncate font-medium">{product.name}</span>
                        <span className="block truncate text-neutral-500">
                          {product.seller.businessName}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
            {post.sellers.length > 0 ? (
              <ul className="mt-5 space-y-2 text-sm">
                {post.sellers.map((seller) => (
                  <li key={seller.id}>
                    <Link href={`/seller/${seller.slug}`} className="font-medium hover:underline">
                      {seller.businessName}
                    </Link>
                    {seller.location ? (
                      <span className="text-neutral-500"> · {seller.location.name}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </aside>
        ) : null}

        {post.author ? (
          <section
            aria-label="About the author"
            className="mt-12 flex gap-4 border-t border-neutral-200 pt-8"
          >
            {post.author.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={post.author.avatarUrl}
                alt=""
                className="h-14 w-14 shrink-0 rounded-full object-cover"
                loading="lazy"
              />
            ) : null}
            <div className="text-sm">
              <p className="font-semibold text-neutral-900">
                <Link href={`/blog/author/${post.author.slug}`} className="hover:underline">
                  {post.author.name}
                </Link>
              </p>
              {post.author.role ? <p className="text-neutral-500">{post.author.role}</p> : null}
              {post.author.bio ? (
                <p className="mt-2 leading-relaxed text-neutral-700">{post.author.bio}</p>
              ) : null}
            </div>
          </section>
        ) : null}

        <div className="mt-12 rounded-xl bg-neutral-50 p-6 text-center">
          <p className="font-medium text-neutral-900">Know what you need?</p>
          <p className="mt-1 text-sm text-neutral-600">
            Post one requirement and matching suppliers will send you quotes.
          </p>
          <div className="mt-4 flex justify-center">
            <PostRequirementCta compact />
          </div>
        </div>
      </article>

      <RelatedArticles title="More guides" posts={related} />
    </div>
  );
}
