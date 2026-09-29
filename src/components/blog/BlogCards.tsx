import Link from "next/link";

/** Article cards for the blog list, related articles and category pages (D45). */

export type BlogCardData = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  publishedAt: Date | null;
  author: { name: string; slug: string } | null;
};

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

export function formatBlogDate(date: Date | null): string {
  return date ? dateFormat.format(date) : "";
}

export function BlogCard({ post, headingLevel = 2 }: { post: BlogCardData; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white transition-shadow hover:shadow-md">
      <Link href={`/blog/${post.slug}`} className="block aspect-video bg-neutral-100" tabIndex={-1}>
        {post.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.coverImageUrl}
            alt={post.coverImageAlt ?? ""}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : null}
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <Heading className="text-base leading-snug font-semibold text-balance">
          <Link href={`/blog/${post.slug}`} className="hover:underline">
            {post.title}
          </Link>
        </Heading>
        {post.excerpt ? (
          <p className="mt-2 line-clamp-3 text-sm text-neutral-600">{post.excerpt}</p>
        ) : null}
        <p className="mt-auto pt-3 text-xs text-neutral-500">
          {[post.author?.name, formatBlogDate(post.publishedAt)].filter(Boolean).join(" · ")}
        </p>
      </div>
    </article>
  );
}

export function RelatedArticles({
  title = "Related guides",
  posts,
}: {
  title?: string;
  posts: BlogCardData[];
}) {
  if (posts.length === 0) return null;
  return (
    <section className="mt-14" aria-labelledby="related-articles">
      <h2 id="related-articles" className="mb-4 text-lg font-semibold">
        {title}
      </h2>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => (
          <BlogCard key={post.id} post={post} headingLevel={3} />
        ))}
      </div>
    </section>
  );
}
