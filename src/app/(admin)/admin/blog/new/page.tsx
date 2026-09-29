import Link from "next/link";
import { requirePermission } from "@/lib/auth/guards";
import { listAuthors, listCategoryOptions } from "@/server/services/admin-blog.service";
import { BlogPostForm } from "@/components/admin/BlogPostForm";

export default async function NewBlogPostPage() {
  await requirePermission("admin:taxonomy:manage");
  const [authors, categories] = await Promise.all([listAuthors(), listCategoryOptions()]);

  return (
    <div className="max-w-4xl">
      <Link href="/admin/blog" className="text-sm text-neutral-400 hover:text-neutral-200">
        ← Blog
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">New article</h1>
      {authors.length === 0 ? (
        <p className="mt-3 rounded-md border border-amber-800 bg-amber-950/40 p-3 text-sm text-amber-200">
          Add an author first (
          <Link href="/admin/blog/authors" className="underline">
            Authors
          </Link>
          ) — an article cannot be published without a named author.
        </p>
      ) : null}
      <BlogPostForm
        post={null}
        authors={authors.map((author) => ({ id: author.id, name: author.name }))}
        categories={categories}
      />
    </div>
  );
}
