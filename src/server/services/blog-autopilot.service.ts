import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/env";
import { getSetting, setSetting } from "@/lib/settings";
import { revalidateBlog } from "@/lib/cache/revalidate";
import { slugify } from "@/lib/utils/slug";
import { BLOG_TOPICS, type BlogTopic } from "@/lib/blog/topics";
import { AUTOPILOT_SYSTEM, autopilotUserPrompt, checkGeneratedArticle } from "@/lib/blog/autopilot";

/**
 * Blog autopilot (D47): one buying guide a day, no human step.
 *
 * Runs from the `blog-autopilot` cron job on the server. Picks the next topic,
 * asks the Claude API for an article, runs the checks in
 * src/lib/blog/autopilot.ts, and publishes it under the "Bzaro Editorial
 * Team" author — never under a real person's name, since no person wrote it.
 * An article that fails a quality check is saved as a DRAFT instead, and
 * shows up in Admin → Blog for a human to fix or delete.
 *
 * Off unless BLOG_AUTOPILOT=1 and ANTHROPIC_API_KEY are set, and pausable
 * from Admin → Blog without a deploy.
 */

export const AUTOPILOT_SETTING_KEY = "blog.autopilot";

const stateSchema = z.object({
  paused: z.boolean().default(false),
  /** Topic keys already written (published or drafted). */
  used: z.array(z.string()).default([]),
  lastRunAt: z.string().nullable().default(null),
  lastResult: z.string().nullable().default(null),
});
export type AutopilotState = z.infer<typeof stateSchema>;
const DEFAULT_STATE: AutopilotState = stateSchema.parse({});

const EDITORIAL_AUTHOR = {
  slug: "bzaro-editorial-team",
  name: "Bzaro Editorial Team",
  role: "Buying guides from the Bzaro team",
  bio: "Practical guides for business buyers in India: what to check, what to ask and how to compare suppliers before you place an order.",
};

export function autopilotConfigured(): boolean {
  return env.BLOG_AUTOPILOT === "1" && Boolean(env.ANTHROPIC_API_KEY);
}

export function getAutopilotState(): Promise<AutopilotState> {
  return getSetting(AUTOPILOT_SETTING_KEY, stateSchema, DEFAULT_STATE);
}

export async function setAutopilotPaused(paused: boolean): Promise<void> {
  const state = await getAutopilotState();
  await setSetting(AUTOPILOT_SETTING_KEY, stateSchema, { ...state, paused });
}

async function saveState(state: AutopilotState, result: string): Promise<void> {
  await setSetting(AUTOPILOT_SETTING_KEY, stateSchema, {
    ...state,
    lastRunAt: new Date().toISOString(),
    lastResult: result.slice(0, 300),
  });
}

/** Next unused topic; after the list, a category that has no guide yet. */
export async function nextTopic(used: string[]): Promise<BlogTopic | null> {
  const fromList = BLOG_TOPICS.find((topic) => !used.includes(topic.key));
  if (fromList) return fromList;

  const covered = new Set(
    (await db.blogPost.findMany({ select: { categoryIds: true } })).flatMap(
      (post) => post.categoryIds,
    ),
  );
  const candidates = await db.category.findMany({
    where: { isActive: true, parentId: null, noindex: false },
    orderBy: [{ productCount: "desc" }, { sortOrder: "asc" }],
    select: { id: true, slug: true, name: true },
  });
  const pick = candidates.find(
    (category) => !covered.has(category.id) && !used.includes(`auto-${category.slug}`),
  );
  if (!pick) return null;
  return {
    key: `auto-${pick.slug}`,
    title: `A practical buying guide for ${pick.name}: pick one specific product that businesses commonly order in this category and cover what to check before buying it`,
    categories: [pick.slug],
  };
}

async function askClaude(system: string, user: string): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: env.BLOG_AUTOPILOT_MODEL || "claude-sonnet-5-5",
      max_tokens: 6000,
      system,
      messages: [{ role: "user", content: user }],
    }),
    signal: AbortSignal.timeout(240_000),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 200);
    throw new Error(`Claude API ${response.status}: ${detail}`);
  }
  const json = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = (json.content ?? [])
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");
  if (!text.trim()) throw new Error("Claude API returned no text");
  return text;
}

async function editorialAuthorId(): Promise<string> {
  const author = await db.blogAuthor.upsert({
    where: { slug: EDITORIAL_AUTHOR.slug },
    create: EDITORIAL_AUTHOR,
    update: {},
    select: { id: true },
  });
  return author.id;
}

async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base).slice(0, 90) || "guide";
  for (let n = 1; n < 50; n++) {
    const candidate = n === 1 ? root : `${root}-${n}`;
    if (!(await db.blogPost.findUnique({ where: { slug: candidate }, select: { id: true } }))) {
      return candidate;
    }
  }
  return `${root}-${Date.now().toString(36)}`;
}

export type AutopilotRun =
  | { status: "skipped"; reason: string }
  | { status: "published" | "drafted"; slug: string; topic: string; notes: string[] }
  | { status: "failed"; topic: string; error: string };

export async function runBlogAutopilot(): Promise<AutopilotRun> {
  if (!autopilotConfigured()) {
    return { status: "skipped", reason: "BLOG_AUTOPILOT is not 1 or ANTHROPIC_API_KEY is missing" };
  }
  const state = await getAutopilotState();
  if (state.paused) return { status: "skipped", reason: "paused in Admin → Blog" };

  // One article per IST calendar day, however often the job is triggered.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  if (state.lastRunAt) {
    const last = new Date(state.lastRunAt).toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });
    if (last === today && state.lastResult?.startsWith("published")) {
      return { status: "skipped", reason: "already published today" };
    }
  }

  const topic = await nextTopic(state.used);
  if (!topic) {
    await saveState(state, "skipped: no topics left");
    return { status: "skipped", reason: "no topics left — add more to src/lib/blog/topics.ts" };
  }

  const existing = await db.blogPost.findMany({
    orderBy: { createdAt: "desc" },
    take: 80,
    select: { title: true },
  });

  let raw: string;
  try {
    raw = await askClaude(
      AUTOPILOT_SYSTEM,
      autopilotUserPrompt(
        topic,
        existing.map((post) => post.title),
      ),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await saveState(state, `failed: ${message}`);
    return { status: "failed", topic: topic.key, error: message };
  }

  const checked = checkGeneratedArticle(raw);
  if (!checked.ok) {
    // Unusable answer: count the topic as tried so a bad topic cannot block
    // the queue, and report it.
    await saveState({ ...state, used: [...state.used, topic.key] }, `failed: ${checked.error}`);
    return { status: "failed", topic: topic.key, error: checked.error };
  }

  const { draft, publish, notes } = checked;
  const slugs = draft.categorySlugs.length ? draft.categorySlugs : topic.categories;
  const categories = await db.category.findMany({
    where: { slug: { in: [...new Set([...slugs, ...topic.categories])] }, isActive: true },
    select: { id: true },
  });
  const slug = await uniqueSlug(draft.slug ?? draft.title);

  await db.blogPost.create({
    data: {
      slug,
      title: draft.title,
      excerpt: draft.excerpt,
      body: draft.body,
      coverImageAlt: draft.coverImageAlt,
      metaTitle: draft.metaTitle,
      metaDescription: draft.metaDescription,
      categoryIds: categories.map((category) => category.id),
      authorId: await editorialAuthorId(),
      status: publish ? "PUBLISHED" : "DRAFT",
      publishedAt: publish ? new Date() : null,
    },
  });

  const status = publish ? "published" : "drafted";
  await saveState(
    { ...state, used: [...state.used, topic.key] },
    `${status}: /blog/${slug}${notes.length ? ` (${notes.join("; ")})` : ""}`,
  );
  if (publish) revalidateBlog("background");
  return { status, slug, topic: topic.key, notes };
}
