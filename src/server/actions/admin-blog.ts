"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guards";
import { blogAuthorSchema, blogPostSchema } from "@/lib/validation/blog";
import { deleteDraft, saveAuthor, savePost } from "@/server/services/admin-blog.service";
import { parseDraftMarkdown } from "@/lib/blog/markdown-import";
import { runBlogAutopilot, setAutopilotPaused } from "@/server/services/blog-autopilot.service";

/** Admin blog editor (D45). */

export type BlogFormState = { ok?: boolean; error?: string; message?: string };

export async function saveBlogPostAction(
  _prev: BlogFormState,
  formData: FormData,
): Promise<BlogFormState> {
  const user = await requirePermission("admin:taxonomy:manage");
  const parsed = blogPostSchema.safeParse({
    id: formData.get("id") ?? "",
    title: formData.get("title") ?? "",
    slug: formData.get("slug") ?? "",
    excerpt: formData.get("excerpt") ?? "",
    body: formData.get("body") ?? "",
    coverImageUrl: formData.get("coverImageUrl") ?? "",
    coverImageAlt: formData.get("coverImageAlt") ?? "",
    authorId: formData.get("authorId") ?? "",
    metaTitle: formData.get("metaTitle") ?? "",
    metaDescription: formData.get("metaDescription") ?? "",
    ogImageUrl: formData.get("ogImageUrl") ?? "",
    canonicalUrl: formData.get("canonicalUrl") ?? "",
    noindex: formData.get("noindex") === "on",
    categoryIds: formData.getAll("categoryIds").map(String),
    productRefs: formData.get("productRefs") ?? "",
    sellerRefs: formData.get("sellerRefs") ?? "",
    publishedOn: formData.get("publishedOn") ?? "",
    intent: formData.get("intent") ?? "draft",
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: `${issue?.path.join(".") ?? "form"}: ${issue?.message ?? "invalid"}` };
  }

  const result = await savePost(parsed.data);
  if (!result.ok) return { error: result.error };

  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: `blog.${parsed.data.intent}`,
      entityType: "BlogPost",
      entityId: result.id,
      after: { slug: result.slug, status: result.status },
    },
  });
  revalidatePath("/admin/blog");
  if (!parsed.data.id) redirect(`/admin/blog/${result.id}?saved=1`);
  return {
    ok: true,
    message: result.status === "PUBLISHED" ? "Published." : "Saved as draft.",
  };
}

export async function deleteBlogDraftAction(formData: FormData): Promise<void> {
  const user = await requirePermission("admin:taxonomy:manage");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  if (await deleteDraft(id)) {
    await db.auditLog.create({
      data: { actorId: user.id, action: "blog.delete", entityType: "BlogPost", entityId: id },
    });
  }
  redirect("/admin/blog");
}

export async function saveBlogAuthorAction(formData: FormData): Promise<void> {
  const user = await requirePermission("admin:taxonomy:manage");
  const parsed = blogAuthorSchema.safeParse({
    id: formData.get("id") ?? "",
    name: formData.get("name") ?? "",
    role: formData.get("role") ?? "",
    bio: formData.get("bio") ?? "",
    avatarUrl: formData.get("avatarUrl") ?? "",
    linkedinUrl: formData.get("linkedinUrl") ?? "",
  });
  if (!parsed.success) return;
  await saveAuthor(parsed.data);
  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: "blog.author",
      entityType: "BlogAuthor",
      entityId: parsed.data.id ?? parsed.data.name,
    },
  });
  revalidatePath("/admin/blog/authors");
}

/**
 * Import a draft written elsewhere (D45) — e.g. the daily draft Claude
 * prepares. Always lands as a DRAFT: publishing stays a human decision.
 */
export async function importBlogDraftAction(
  _prev: BlogFormState,
  formData: FormData,
): Promise<BlogFormState> {
  const user = await requirePermission("admin:taxonomy:manage");
  const parsed = parseDraftMarkdown(String(formData.get("markdown") ?? ""));
  if (!parsed.ok) return { error: parsed.error };
  const { draft } = parsed;

  const categories = draft.categorySlugs.length
    ? await db.category.findMany({
        where: { slug: { in: draft.categorySlugs } },
        select: { id: true, slug: true },
      })
    : [];
  const missing = draft.categorySlugs.filter(
    (slug) => !categories.some((category) => category.slug.toLowerCase() === slug),
  );

  const input = blogPostSchema.safeParse({
    id: "",
    title: draft.title,
    slug: draft.slug ?? "",
    excerpt: draft.excerpt ?? "",
    body: draft.body,
    coverImageUrl: draft.coverImageUrl ?? "",
    coverImageAlt: draft.coverImageAlt ?? "",
    authorId: String(formData.get("authorId") ?? ""),
    metaTitle: draft.metaTitle ?? "",
    metaDescription: draft.metaDescription ?? "",
    ogImageUrl: "",
    canonicalUrl: "",
    noindex: false,
    categoryIds: categories.map((category) => category.id),
    productRefs: "",
    sellerRefs: "",
    publishedOn: "",
    intent: "draft",
  });
  if (!input.success) {
    const issue = input.error.issues[0];
    return { error: `${issue?.path.join(".") ?? "draft"}: ${issue?.message ?? "invalid"}` };
  }

  const result = await savePost(input.data);
  if (!result.ok) return { error: result.error };
  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: "blog.import",
      entityType: "BlogPost",
      entityId: result.id,
      after: { slug: result.slug, unknownCategories: missing },
    },
  });
  revalidatePath("/admin/blog");
  redirect(`/admin/blog/${result.id}?imported=1`);
}

/** Pause or resume the daily autopilot (D47). */
export async function setAutopilotPausedAction(formData: FormData): Promise<void> {
  const user = await requirePermission("admin:taxonomy:manage");
  const paused = formData.get("paused") === "1";
  await setAutopilotPaused(paused);
  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: paused ? "blog.autopilot_paused" : "blog.autopilot_resumed",
      entityType: "Setting",
      entityId: "blog.autopilot",
    },
  });
  revalidatePath("/admin/blog");
}

/** Write (and, if it passes the checks, publish) today's guide right now. */
export async function runAutopilotNowAction(): Promise<void> {
  const user = await requirePermission("admin:taxonomy:manage");
  const run = await runBlogAutopilot();
  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: "blog.autopilot_run",
      entityType: "Setting",
      entityId: "blog.autopilot",
      after: run as object,
    },
  });
  revalidatePath("/admin/blog");
}
