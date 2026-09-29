import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { cacheTags } from "@/lib/cache/tags";

/**
 * The blog (D45): buyer guides written by the Bzaro team.
 *
 * Internal linking is by TAG, not by keyword: each article lists the
 * categories, products and suppliers it is about, and those drive "related"
 * blocks in both directions (article → listings, category/product/supplier →
 * articles). Nothing is ever auto-linked inside the body text.
 */

const REVALIDATE = 3600;
export const BLOG_PAGE_SIZE = 12;

/** Published, and not scheduled in the future. */
function publishedNow(): Prisma.BlogPostWhereInput {
  return { status: "PUBLISHED", publishedAt: { lte: new Date() } };
}

const cardSelect = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  coverImageUrl: true,
  coverImageAlt: true,
  publishedAt: true,
  updatedAt: true,
  author: { select: { name: true, slug: true } },
} satisfies Prisma.BlogPostSelect;

export type BlogCard = Prisma.BlogPostGetPayload<{ select: typeof cardSelect }>;

export function listPublishedPosts(page = 1) {
  return unstable_cache(
    async () => {
      const where = publishedNow();
      const [posts, total] = await Promise.all([
        db.blogPost.findMany({
          where,
          orderBy: { publishedAt: "desc" },
          skip: (page - 1) * BLOG_PAGE_SIZE,
          take: BLOG_PAGE_SIZE,
          select: cardSelect,
        }),
        db.blogPost.count({ where }),
      ]);
      return { posts, total, pageCount: Math.max(1, Math.ceil(total / BLOG_PAGE_SIZE)) };
    },
    ["blog-list", String(page)],
    { tags: [cacheTags.blog()], revalidate: REVALIDATE },
  )();
}

/** One article with its author and the live listings it is tagged with. */
export function getPublishedPost(slug: string) {
  return unstable_cache(
    async () => {
      const post = await db.blogPost.findFirst({
        where: { slug, ...publishedNow() },
        select: {
          ...cardSelect,
          body: true,
          metaTitle: true,
          metaDescription: true,
          ogImageUrl: true,
          noindex: true,
          canonicalUrl: true,
          categoryIds: true,
          productIds: true,
          sellerIds: true,
          createdAt: true,
          author: {
            select: {
              name: true,
              slug: true,
              role: true,
              bio: true,
              avatarUrl: true,
              linkedinUrl: true,
            },
          },
        },
      });
      if (!post) return null;

      // Tags resolve to LIVE listings only: a deleted product or suspended
      // supplier silently drops out rather than becoming a dead link.
      const [categories, products, sellers] = await Promise.all([
        post.categoryIds.length
          ? db.category.findMany({
              where: { id: { in: post.categoryIds }, isActive: true },
              select: { id: true, name: true, path: true },
            })
          : [],
        post.productIds.length
          ? db.product.findMany({
              where: {
                id: { in: post.productIds },
                status: "PUBLISHED",
                deletedAt: null,
                moderationStatus: "APPROVED",
                seller: { status: "VERIFIED", deletedAt: null },
              },
              select: {
                id: true,
                slug: true,
                name: true,
                images: {
                  where: { moderationStatus: "APPROVED" },
                  orderBy: { sortOrder: "asc" },
                  take: 1,
                  select: { url: true, alt: true },
                },
                seller: { select: { slug: true, businessName: true } },
              },
            })
          : [],
        post.sellerIds.length
          ? db.seller.findMany({
              where: { id: { in: post.sellerIds }, status: "VERIFIED", deletedAt: null },
              select: {
                id: true,
                slug: true,
                businessName: true,
                logoUrl: true,
                location: { select: { name: true } },
              },
            })
          : [],
      ]);
      return { ...post, categories, products, sellers };
    },
    ["blog-post", slug],
    { tags: [cacheTags.blog()], revalidate: REVALIDATE },
  )();
}

/** Other articles on the same categories, newest first; topped up with the latest. */
export function getRelatedPosts(postId: string, categoryIds: string[], limit = 3) {
  return unstable_cache(
    async () => {
      const base = { ...publishedNow(), id: { not: postId } };
      const same = categoryIds.length
        ? await db.blogPost.findMany({
            where: { ...base, categoryIds: { hasSome: categoryIds } },
            orderBy: { publishedAt: "desc" },
            take: limit,
            select: cardSelect,
          })
        : [];
      if (same.length >= limit) return same;
      const latest = await db.blogPost.findMany({
        where: { ...base, id: { notIn: [postId, ...same.map((post) => post.id)] } },
        orderBy: { publishedAt: "desc" },
        take: limit - same.length,
        select: cardSelect,
      });
      return [...same, ...latest];
    },
    ["blog-related", postId, categoryIds.join(","), String(limit)],
    { tags: [cacheTags.blog()], revalidate: REVALIDATE },
  )();
}

/** Articles tagged with a category or any of its ancestors (category pages). */
export function getPostsForCategory(categoryId: string, ancestorIds: string[], limit = 3) {
  return unstable_cache(
    async () =>
      db.blogPost.findMany({
        where: { ...publishedNow(), categoryIds: { hasSome: [categoryId, ...ancestorIds] } },
        orderBy: { publishedAt: "desc" },
        take: limit,
        select: cardSelect,
      }),
    ["blog-for-category", categoryId, String(limit)],
    { tags: [cacheTags.blog()], revalidate: REVALIDATE },
  )();
}

/** Articles that feature a product or a supplier ("Featured in" blocks). */
export function getPostsMentioning(input: { productId?: string; sellerId?: string }, limit = 3) {
  return unstable_cache(
    async () => {
      const or: Prisma.BlogPostWhereInput[] = [];
      if (input.productId) or.push({ productIds: { has: input.productId } });
      if (input.sellerId) or.push({ sellerIds: { has: input.sellerId } });
      if (or.length === 0) return [];
      return db.blogPost.findMany({
        where: { ...publishedNow(), OR: or },
        orderBy: { publishedAt: "desc" },
        take: limit,
        select: cardSelect,
      });
    },
    ["blog-mentioning", input.productId ?? "-", input.sellerId ?? "-", String(limit)],
    { tags: [cacheTags.blog()], revalidate: REVALIDATE },
  )();
}

export function getAuthorWithPosts(slug: string) {
  return unstable_cache(
    async () => {
      const author = await db.blogAuthor.findUnique({
        where: { slug },
        select: {
          id: true,
          slug: true,
          name: true,
          role: true,
          bio: true,
          avatarUrl: true,
          linkedinUrl: true,
        },
      });
      if (!author) return null;
      const posts = await db.blogPost.findMany({
        where: { ...publishedNow(), authorId: author.id },
        orderBy: { publishedAt: "desc" },
        take: 50,
        select: cardSelect,
      });
      return { ...author, posts };
    },
    ["blog-author", slug],
    { tags: [cacheTags.blog()], revalidate: REVALIDATE },
  )();
}

/** Every indexable article, for the sitemap. */
export function listSitemapPosts() {
  return unstable_cache(
    async () =>
      db.blogPost.findMany({
        where: { ...publishedNow(), noindex: false, canonicalUrl: null },
        orderBy: { publishedAt: "desc" },
        take: 10_000,
        select: { slug: true, updatedAt: true },
      }),
    ["sitemap-blog"],
    { tags: [cacheTags.blog(), cacheTags.sitemap()], revalidate: REVALIDATE },
  )();
}

/** Authors with at least one live article, for the sitemap. */
export function listSitemapAuthors() {
  return unstable_cache(
    async () =>
      db.blogAuthor.findMany({
        where: { posts: { some: publishedNow() } },
        select: { slug: true, updatedAt: true },
      }),
    ["sitemap-blog-authors"],
    { tags: [cacheTags.blog(), cacheTags.sitemap()], revalidate: REVALIDATE },
  )();
}
