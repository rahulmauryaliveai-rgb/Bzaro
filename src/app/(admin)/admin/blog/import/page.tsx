import Link from "next/link";
import { requirePermission } from "@/lib/auth/guards";
import { listAuthors } from "@/server/services/admin-blog.service";
import { BlogImportForm } from "@/components/admin/BlogImportForm";

/**
 * Paste a draft (D45) — the daily draft Claude prepares, or anything written
 * in the same format. It is saved as a DRAFT and opens in the editor; nothing
 * goes live until someone reads it and presses Publish.
 */
export default async function BlogImportPage() {
  await requirePermission("admin:taxonomy:manage");
  const authors = await listAuthors();

  return (
    <div className="max-w-3xl">
      <Link href="/admin/blog" className="text-sm text-neutral-400 hover:text-neutral-200">
        ← Blog
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Import a draft</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Paste the whole draft, including the <code>---</code> header. It is saved as a draft and
        opens in the editor for review — you publish it from there.
      </p>
      <BlogImportForm authors={authors.map((author) => ({ id: author.id, name: author.name }))} />
    </div>
  );
}
