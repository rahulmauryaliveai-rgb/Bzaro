import Link from "next/link";
import { requirePermission } from "@/lib/auth/guards";
import { listAuthors } from "@/server/services/admin-blog.service";
import { saveBlogAuthorAction } from "@/server/actions/admin-blog";

/**
 * Blog authors (D45). Real people with a real role and a short bio — the
 * "who wrote this and why should I trust them" half of E-E-A-T.
 */

const input =
  "w-full rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-neutral-100 placeholder:text-neutral-500";

export default async function BlogAuthorsPage() {
  await requirePermission("admin:taxonomy:manage");
  const authors = await listAuthors();

  return (
    <div className="max-w-3xl">
      <Link href="/admin/blog" className="text-sm text-neutral-400 hover:text-neutral-200">
        ← Blog
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Authors</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Each article names its author, with this role and bio underneath. Use real names and real
        experience.
      </p>

      <div className="mt-6 space-y-4">
        {[...authors, null].map((author) => (
          <form
            key={author?.id ?? "new"}
            action={saveBlogAuthorAction}
            className="space-y-3 rounded-lg border border-neutral-700 bg-neutral-800 p-5 text-sm"
          >
            <input type="hidden" name="id" value={author?.id ?? ""} />
            <p className="text-xs font-semibold tracking-wide text-neutral-400 uppercase">
              {author ? `${author.name} · ${author._count.posts} articles` : "New author"}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                name="name"
                defaultValue={author?.name ?? ""}
                required
                minLength={2}
                maxLength={80}
                placeholder="Rahul Maurya"
                className={input}
              />
              <input
                name="role"
                defaultValue={author?.role ?? ""}
                maxLength={80}
                placeholder="Founder, Bzaro"
                className={input}
              />
              <input
                name="avatarUrl"
                defaultValue={author?.avatarUrl ?? ""}
                placeholder="Photo URL (https://…)"
                className={input}
              />
              <input
                name="linkedinUrl"
                defaultValue={author?.linkedinUrl ?? ""}
                placeholder="LinkedIn URL (https://…)"
                className={input}
              />
            </div>
            <textarea
              name="bio"
              defaultValue={author?.bio ?? ""}
              maxLength={1000}
              rows={3}
              placeholder="Two or three sentences: experience that makes this person worth listening to."
              className={input}
            />
            <button
              type="submit"
              className="rounded-md bg-white px-3 py-1.5 font-medium text-neutral-900 hover:bg-neutral-200"
            >
              {author ? "Save" : "Add author"}
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}
