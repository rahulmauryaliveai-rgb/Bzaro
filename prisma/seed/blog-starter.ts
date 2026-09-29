import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "../../src/generated/prisma/client";
import { parseDraftMarkdown } from "../../src/lib/blog/markdown-import";

/**
 * Load the guides in docs/content/blog/*.md (D45, D48).
 *
 * Each file may carry `publish_on: YYYY-MM-DD` — it is stored as published
 * with that date at 09:00 IST and stays invisible until then, so a batch of
 * files becomes a publishing schedule with no cron and no API. Files without
 * a date go live at once.
 *
 * `author:` picks an author by slug (`bzaro-editorial-team` is created on
 * demand); otherwise the first author, or one created from BLOG_AUTHOR_NAME
 * (default "Rahul Maurya").
 *
 * Idempotent: an article whose slug already exists is left alone, so edits
 * made in Admin → Blog are never overwritten. Safe to re-run after adding
 * more files.
 *
 * Run on the server:  npm run db:seed:blog
 */

const EDITORIAL = {
  slug: "bzaro-editorial-team",
  name: "Bzaro Editorial Team",
  role: "Buying guides from the Bzaro team",
  bio: "Practical guides for business buyers in India: what to check, what to ask and how to compare suppliers before you place an order.",
};

async function main() {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  for (const file of [`.env.${nodeEnv}.local`, ".env.local", `.env.${nodeEnv}`, ".env"]) {
    loadEnv({ path: file, quiet: true });
  }
  const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");
  const pool = new Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    let author = await prisma.blogAuthor.findFirst({ orderBy: { createdAt: "asc" } });
    if (!author) {
      const name = process.env.BLOG_AUTHOR_NAME?.trim() || "Rahul Maurya";
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      author = await prisma.blogAuthor.create({ data: { name, slug } });
      console.log(`✓ author created: ${name} (add role, bio and photo in Admin → Blog → Authors)`);
    }

    const defaultAuthorId = author.id;
    const authorIdFor = async (slug: string | null): Promise<string> => {
      if (slug) {
        const found = await prisma.blogAuthor.findUnique({ where: { slug }, select: { id: true } });
        if (found) return found.id;
        if (slug === EDITORIAL.slug) {
          return (await prisma.blogAuthor.create({ data: EDITORIAL, select: { id: true } })).id;
        }
        console.log(`  (author "${slug}" not found — using the default author)`);
      }
      return defaultAuthorId;
    };

    const dir = join(process.cwd(), "docs", "content", "blog");
    const files = (await readdir(dir)).filter((file) => file.endsWith(".md")).sort();
    const now = Date.now();

    let undated = 0;
    for (const file of files) {
      const parsed = parseDraftMarkdown(await readFile(join(dir, file), "utf8"));
      if (!parsed.ok) {
        console.log(`✗ ${file}: ${parsed.error}`);
        continue;
      }
      const { draft } = parsed;
      const slug = draft.slug ?? file.replace(/\.md$/, "");
      if (await prisma.blogPost.findUnique({ where: { slug }, select: { id: true } })) {
        console.log(`= ${slug}: already exists, left as is`);
        continue;
      }
      const categories = await prisma.category.findMany({
        where: { slug: { in: draft.categorySlugs } },
        select: { id: true },
      });
      await prisma.blogPost.create({
        data: {
          slug,
          title: draft.title,
          excerpt: draft.excerpt,
          body: draft.body,
          coverImageUrl: draft.coverImageUrl,
          coverImageAlt: draft.coverImageAlt,
          metaTitle: draft.metaTitle,
          metaDescription: draft.metaDescription,
          categoryIds: categories.map((category) => category.id),
          authorId: await authorIdFor(draft.authorSlug),
          status: "PUBLISHED",
          // A dated file waits for its day (09:00 IST); undated ones go live
          // now, a day apart so the list has a sensible order.
          publishedAt: draft.publishOn
            ? new Date(`${draft.publishOn}T09:00:00+05:30`)
            : new Date(now - undated++ * 86_400_000),
        },
      });
      const when =
        draft.publishOn && new Date(`${draft.publishOn}T09:00:00+05:30`).getTime() > now
          ? `scheduled for ${draft.publishOn} 09:00 IST`
          : "published";
      console.log(`✓ ${when}: /blog/${slug}`);
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
