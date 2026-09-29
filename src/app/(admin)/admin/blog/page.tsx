import Link from "next/link";
import { requirePermission } from "@/lib/auth/guards";
import { listPostsForAdmin } from "@/server/services/admin-blog.service";
import { marketplaceUrl } from "@/lib/utils/url";

/** Blog articles (D45): drafts and published, newest edit first. */
export default async function AdminBlogPage() {
  await requirePermission("admin:taxonomy:manage");
  const posts = await listPostsForAdmin();

  return (
    <div className="max-w-5xl">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Blog</h1>
        <Link
          href="/admin/blog/new"
          className="ml-auto rounded-md bg-white px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-neutral-200"
        >
          New article
        </Link>
        <Link
          href="/admin/blog/import"
          className="rounded-md border border-neutral-600 px-3 py-1.5 text-sm hover:bg-neutral-700"
        >
          Import draft
        </Link>
        <Link
          href="/admin/blog/authors"
          className="rounded-md border border-neutral-600 px-3 py-1.5 text-sm hover:bg-neutral-700"
        >
          Authors
        </Link>
      </div>
      <p className="mt-1 text-sm text-neutral-400">
        Buyer guides at{" "}
        <a href={marketplaceUrl("/blog")} className="underline" target="_blank" rel="noreferrer">
          bzaro.in/blog
        </a>
        . Tag each article with the categories, products and suppliers it is about — those links
        appear on both sides automatically.
      </p>

      {posts.length === 0 ? (
        <p className="mt-8 rounded-lg border border-dashed border-neutral-700 p-8 text-center text-sm text-neutral-400">
          No articles yet. Add an author first, then write the first guide.
        </p>
      ) : (
        <table className="mt-6 w-full text-left text-sm">
          <thead className="text-xs text-neutral-500 uppercase">
            <tr>
              <th className="py-2 pr-3">Title</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Author</th>
              <th className="py-2 pr-3">Published</th>
              <th className="py-2">Edited</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {posts.map((post) => (
              <tr key={post.id}>
                <td className="py-2.5 pr-3">
                  <Link href={`/admin/blog/${post.id}`} className="font-medium hover:underline">
                    {post.title}
                  </Link>
                  <span className="block font-mono text-xs text-neutral-500">
                    /blog/{post.slug}
                  </span>
                </td>
                <td className="py-2.5 pr-3">
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs ${
                      post.status === "PUBLISHED"
                        ? "bg-emerald-900/60 text-emerald-300"
                        : "bg-neutral-800 text-neutral-300"
                    }`}
                  >
                    {post.status === "PUBLISHED" ? "Published" : "Draft"}
                  </span>
                  {post.noindex ? (
                    <span className="ml-1 text-xs text-amber-400">noindex</span>
                  ) : null}
                </td>
                <td className="py-2.5 pr-3 text-neutral-300">{post.author?.name ?? "—"}</td>
                <td className="py-2.5 pr-3 text-neutral-400">
                  {post.publishedAt ? post.publishedAt.toISOString().slice(0, 10) : "—"}
                </td>
                <td className="py-2.5 text-neutral-400">
                  {post.updatedAt.toISOString().slice(0, 10)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
