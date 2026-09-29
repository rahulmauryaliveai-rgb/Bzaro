import Link from "next/link";
import { requirePermission } from "@/lib/auth/guards";
import { listPostsForAdmin } from "@/server/services/admin-blog.service";
import { marketplaceUrl } from "@/lib/utils/url";
import {
  autopilotConfigured,
  getAutopilotState,
  nextTopic,
} from "@/server/services/blog-autopilot.service";
import { runAutopilotNowAction, setAutopilotPausedAction } from "@/server/actions/admin-blog";

/** Blog articles (D45): drafts and published, newest edit first. */
export default async function AdminBlogPage() {
  await requirePermission("admin:taxonomy:manage");
  const [posts, autopilot, configured] = await Promise.all([
    listPostsForAdmin(),
    getAutopilotState(),
    Promise.resolve(autopilotConfigured()),
  ]);
  const upcoming = await nextTopic(autopilot.used);
  const scheduledCount = posts.filter((post) => post.scheduled).length;

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

      <p className="mt-4 text-sm text-neutral-300">
        {scheduledCount > 0
          ? `${scheduledCount} guide${scheduledCount === 1 ? "" : "s"} scheduled — each goes live on its date at 09:00 IST, no action needed.`
          : "No guides scheduled. Set a future publication date on an article and press Schedule."}
      </p>

      <section className="mt-6 rounded-lg border border-neutral-700 bg-neutral-800 p-4 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-medium">
            Daily autopilot:{" "}
            {!configured ? (
              <span className="text-neutral-400">
                off (set ANTHROPIC_API_KEY and BLOG_AUTOPILOT=1)
              </span>
            ) : autopilot.paused ? (
              <span className="text-amber-300">paused</span>
            ) : (
              <span className="text-emerald-300">on — one guide every day at 9:05 IST</span>
            )}
          </p>
          {configured ? (
            <div className="ml-auto flex gap-2">
              <form action={setAutopilotPausedAction}>
                <input type="hidden" name="paused" value={autopilot.paused ? "0" : "1"} />
                <button
                  type="submit"
                  className="rounded-md border border-neutral-600 px-3 py-1.5 hover:bg-neutral-700"
                >
                  {autopilot.paused ? "Resume" : "Pause"}
                </button>
              </form>
              <form action={runAutopilotNowAction}>
                <button
                  type="submit"
                  className="rounded-md border border-neutral-600 px-3 py-1.5 hover:bg-neutral-700"
                >
                  Write one now
                </button>
              </form>
            </div>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-neutral-400">
          Next topic: {upcoming?.title ?? "none left — add topics in src/lib/blog/topics.ts"}
          {autopilot.lastRunAt ? (
            <>
              {" · "}Last run {autopilot.lastRunAt.slice(0, 16).replace("T", " ")} UTC:{" "}
              {autopilot.lastResult}
            </>
          ) : null}
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          Guides that pass the checks are published as &quot;Bzaro Editorial Team&quot;; any that
          fail a check are saved as drafts here for you to fix or delete. Read a few each week.
        </p>
      </section>

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
                      post.status !== "PUBLISHED"
                        ? "bg-neutral-800 text-neutral-300"
                        : post.scheduled
                          ? "bg-sky-900/60 text-sky-300"
                          : "bg-emerald-900/60 text-emerald-300"
                    }`}
                  >
                    {post.status !== "PUBLISHED"
                      ? "Draft"
                      : post.scheduled
                        ? "Scheduled"
                        : "Published"}
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
