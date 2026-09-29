import "server-only";
import { db } from "@/lib/db";
import { slugify } from "@/lib/utils/slug";
import { revalidateBlog } from "@/lib/cache/revalidate";
import {
  parseProductRef,
  parseSellerRef,
  splitRefs,
  type BlogPostInput,
} from "@/lib/validation/blog";

/** Admin side of the blog (D45). */

export async function listPostsForAdmin() {
  const rows = await db.blogPost.findMany({
    orderBy: [{ updatedAt: "desc" }],
    take: 200,
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      publishedAt: true,
      updatedAt: true,
      noindex: true,
      author: { select: { name: true } },
    },
  });
  // Published with a future date = scheduled: invisible until that moment.
  const now = Date.now();
  return rows.map((row) => ({
    ...row,
    scheduled: row.status === "PUBLISHED" && !!row.publishedAt && row.publishedAt.getTime() > now,
  }));
}

export async function getPostForAdmin(id: string) {
  const post = await db.blogPost.findUnique({ where: { id } });
  if (!post) return null;
  // Show tagged listings back as the references an admin would paste.
  const [products, sellers] = await Promise.all([
    post.productIds.length
      ? db.product.findMany({
          where: { id: { in: post.productIds } },
          select: { slug: true, seller: { select: { slug: true } } },
        })
      : [],
    post.sellerIds.length
      ? db.seller.findMany({ where: { id: { in: post.sellerIds } }, select: { slug: true } })
      : [],
  ]);
  return {
    ...post,
    scheduled:
      post.status === "PUBLISHED" && !!post.publishedAt && post.publishedAt.getTime() > Date.now(),
    productRefs: products.map((product) => `${product.seller.slug}/${product.slug}`).join("\n"),
    sellerRefs: sellers.map((seller) => seller.slug).join("\n"),
  };
}

export function listAuthors() {
  return db.blogAuthor.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      role: true,
      bio: true,
      avatarUrl: true,
      linkedinUrl: true,
      _count: { select: { posts: true } },
    },
  });
}

/** Every active category with its trail, for the tag picker. */
export async function listCategoryOptions() {
  const rows = await db.category.findMany({
    where: { isActive: true },
    orderBy: { path: "asc" },
    select: { id: true, name: true, depth: true, ancestorIds: true },
  });
  const names = new Map(rows.map((row) => [row.id, row.name]));
  return rows.map((row) => ({
    id: row.id,
    label: [...row.ancestorIds.map((id) => names.get(id) ?? "…"), row.name].join(" › "),
  }));
}

async function uniqueSlug(base: string, excludeId: string | null): Promise<string> {
  const root = base.slice(0, 90) || "article";
  for (let n = 1; n < 50; n++) {
    const candidate = n === 1 ? root : `${root}-${n}`;
    const clash = await db.blogPost.findFirst({
      where: { slug: candidate, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    if (!clash) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

export type SavePostResult =
  | {
      ok: true;
      id: string;
      slug: string;
      status: "DRAFT" | "PUBLISHED";
      /** Set for a published article; in the future = scheduled. */
      publishedAt: Date | null;
    }
  | { ok: false; error: string };

export async function savePost(input: BlogPostInput): Promise<SavePostResult> {
  // Resolve pasted references to live ids; report what did not match.
  const productRefs = splitRefs(input.productRefs);
  const sellerRefs = splitRefs(input.sellerRefs);
  const unresolved: string[] = [];

  const productIds: string[] = [];
  for (const ref of productRefs) {
    const parsed = parseProductRef(ref);
    const row = parsed
      ? await db.product.findFirst({
          where: { slug: parsed.slug, seller: { slug: parsed.seller }, deletedAt: null },
          select: { id: true },
        })
      : null;
    if (row) productIds.push(row.id);
    else unresolved.push(ref);
  }
  const sellerIds: string[] = [];
  for (const ref of sellerRefs) {
    const slug = parseSellerRef(ref);
    const row = slug
      ? await db.seller.findFirst({ where: { slug, deletedAt: null }, select: { id: true } })
      : null;
    if (row) sellerIds.push(row.id);
    else unresolved.push(ref);
  }
  if (unresolved.length > 0) {
    return { ok: false, error: `Not found: ${unresolved.slice(0, 5).join(", ")}` };
  }

  const categoryIds = input.categoryIds.length
    ? (
        await db.category.findMany({
          where: { id: { in: input.categoryIds } },
          select: { id: true },
        })
      ).map((row) => row.id)
    : [];

  const existing = input.id
    ? await db.blogPost.findUnique({
        where: { id: input.id },
        select: { id: true, status: true, publishedAt: true },
      })
    : null;
  if (input.id && !existing) return { ok: false, error: "Article not found" };

  // Drafts carry notes like "[Rahul: add one example…]" for the reviewer;
  // publishing one by accident would put the note on the live page.
  if (input.intent === "publish" && /\[(?:rahul|todo|note|editor)\b[^\]]*\]/i.test(input.body)) {
    return {
      ok: false,
      error:
        "The article still has a note in square brackets (e.g. [Rahul: …]). Replace it before publishing.",
    };
  }

  if (input.intent === "publish" && !input.authorId) {
    return { ok: false, error: "Choose an author before publishing — every article names one." };
  }

  const slug = await uniqueSlug(input.slug ?? slugify(input.title), existing?.id ?? null);
  const chosenDate = input.publishedOn ? new Date(`${input.publishedOn}T09:00:00+05:30`) : null;
  const status =
    input.intent === "publish"
      ? "PUBLISHED"
      : input.intent === "unpublish"
        ? "DRAFT"
        : (existing?.status ?? "DRAFT");
  // First publish stamps the date; later edits keep it (the "updated" date
  // comes from updatedAt). An explicit date wins either way.
  const publishedAt =
    chosenDate ?? existing?.publishedAt ?? (status === "PUBLISHED" ? new Date() : null);

  const data = {
    slug,
    title: input.title,
    excerpt: input.excerpt,
    body: input.body,
    coverImageUrl: input.coverImageUrl,
    coverImageAlt: input.coverImageAlt,
    authorId: input.authorId,
    metaTitle: input.metaTitle,
    metaDescription: input.metaDescription,
    ogImageUrl: input.ogImageUrl,
    canonicalUrl: input.canonicalUrl,
    noindex: input.noindex,
    categoryIds,
    productIds,
    sellerIds,
    status,
    publishedAt,
  } as const;

  const row = existing
    ? await db.blogPost.update({ where: { id: existing.id }, data, select: { id: true } })
    : await db.blogPost.create({ data, select: { id: true } });

  revalidateBlog("immediate");
  return { ok: true, id: row.id, slug, status, publishedAt };
}

export async function deleteDraft(id: string): Promise<boolean> {
  const post = await db.blogPost.findUnique({ where: { id }, select: { status: true } });
  if (!post || post.status === "PUBLISHED") return false;
  await db.blogPost.delete({ where: { id } });
  revalidateBlog("immediate");
  return true;
}

export async function saveAuthor(input: {
  id: string | null;
  name: string;
  role: string | null;
  bio: string | null;
  avatarUrl: string | null;
  linkedinUrl: string | null;
}) {
  const fields = {
    name: input.name,
    role: input.role,
    bio: input.bio,
    avatarUrl: input.avatarUrl,
    linkedinUrl: input.linkedinUrl,
  };
  if (input.id) {
    await db.blogAuthor.update({ where: { id: input.id }, data: fields });
  } else {
    let slug = slugify(input.name) || "author";
    for (
      let n = 2;
      await db.blogAuthor.findUnique({ where: { slug }, select: { id: true } });
      n++
    ) {
      slug = `${slugify(input.name)}-${n}`;
    }
    await db.blogAuthor.create({ data: { ...fields, slug } });
  }
  revalidateBlog("immediate");
}
