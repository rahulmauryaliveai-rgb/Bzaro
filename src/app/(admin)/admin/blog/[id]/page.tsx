import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/guards";
import {
  getPostForAdmin,
  listAuthors,
  listCategoryOptions,
} from "@/server/services/admin-blog.service";
import { deleteBlogDraftAction } from "@/server/actions/admin-blog";
import { BlogPostForm } from "@/components/admin/BlogPostForm";
import { marketplaceUrl } from "@/lib/utils/url";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function EditBlogPostPage({ params, searchParams }: Props) {
  await requirePermission("admin:taxonomy:manage");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const imported = query.imported === "1";
  const [post, authors, categories] = await Promise.all([
    getPostForAdmin(id),
    listAuthors(),
    listCategoryOptions(),
  ]);
  if (!post) notFound();

  return (
    <div className="max-w-4xl">
      <Link href="/admin/blog" className="text-sm text-neutral-400 hover:text-neutral-200">
        ← Blog
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{post.title}</h1>
        {post.status === "PUBLISHED" ? (
          <a
            href={marketplaceUrl(`/blog/${post.slug}`)}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-sky-300 underline"
          >
            View live ↗
          </a>
        ) : (
          <form action={deleteBlogDraftAction} className="ml-auto">
            <input type="hidden" name="id" value={post.id} />
            <button
              type="submit"
              className="rounded-md border border-red-900 px-3 py-1.5 text-sm text-red-300 hover:bg-red-950"
            >
              Delete draft
            </button>
          </form>
        )}
      </div>
      {imported && post.status !== "PUBLISHED" ? (
        <p className="mt-3 rounded-md border border-sky-800 bg-sky-950/40 p-3 text-sm text-sky-200">
          Imported as a draft. Read it in Preview, add your own example or photo, check the tagged
          categories, then press <strong>Publish</strong>.
        </p>
      ) : null}
      <BlogPostForm
        post={{
          id: post.id,
          title: post.title,
          slug: post.slug,
          excerpt: post.excerpt ?? "",
          body: post.body,
          coverImageUrl: post.coverImageUrl ?? "",
          coverImageAlt: post.coverImageAlt ?? "",
          authorId: post.authorId ?? "",
          metaTitle: post.metaTitle ?? "",
          metaDescription: post.metaDescription ?? "",
          ogImageUrl: post.ogImageUrl ?? "",
          canonicalUrl: post.canonicalUrl ?? "",
          noindex: post.noindex,
          categoryIds: post.categoryIds,
          productRefs: post.productRefs,
          sellerRefs: post.sellerRefs,
          publishedOn: post.publishedAt ? post.publishedAt.toISOString().slice(0, 10) : "",
          status: post.status,
        }}
        authors={authors.map((author) => ({ id: author.id, name: author.name }))}
        categories={categories}
      />
    </div>
  );
}
