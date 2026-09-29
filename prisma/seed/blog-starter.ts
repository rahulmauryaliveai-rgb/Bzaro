import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "../../src/generated/prisma/client";
import { parseDraftMarkdown } from "../../src/lib/blog/markdown-import";

/**
 * Publish the starter buying guides in docs/content/blog/*.md (D45).
 *
 * Idempotent: an article whose slug already exists is left alone, so edits
 * made in Admin → Blog are never overwritten. The author is the first blog
 * author; if there is none, one is created from BLOG_AUTHOR_NAME (default
 * "Rahul Maurya") — add a role, bio and photo in Admin → Blog → Authors.
 *
 * Run on the server:  npm run db:seed:blog-starter
 * The blog, homepage section and sitemap pick the articles up within the
 * hour; saving any article in Admin → Blog refreshes them immediately.
 */

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

    const dir = join(process.cwd(), "docs", "content", "blog");
    const files = (await readdir(dir)).filter((file) => file.endsWith(".md")).sort();
    const now = Date.now();

    for (const [index, file] of files.entries()) {
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
          authorId: author.id,
          status: "PUBLISHED",
          // A day apart, so the list has a sensible order.
          publishedAt: new Date(now - index * 86_400_000),
        },
      });
      console.log(`✓ published /blog/${slug}`);
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
