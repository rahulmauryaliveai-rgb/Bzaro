import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { env } from "@/env";
import { cacheTags } from "@/lib/cache/tags";
import {
  revalidateCategory,
  revalidateHome,
  revalidateLocation,
  revalidateTenant,
} from "@/lib/cache/revalidate";
import { db } from "@/lib/db";

/**
 * Operator-triggered cache invalidation (docs/DEPLOYMENT.md §6).
 *
 * Writes that go through the app revalidate their own tags. Writes that do
 * not — a seed run, a manual SQL fix, an image swapped on disk — leave the
 * ISR pages and `unstable_cache` entries stale for up to an hour. This is
 * the switch for those cases:
 *
 *   curl -X POST -H "Authorization: Bearer $REVALIDATE_SECRET" \
 *        -H "Content-Type: application/json" \
 *        -d '{"scope":"all"}' https://bzaro.in/api/revalidate
 *
 *   scope: "all"         home, category tree, every category, city and seller
 *          "home"        homepage + category tree (category tiles, stats)
 *          "sellers"     every live seller's microsite and marketplace page
 *   tags:  ["..."]       explicit cache tags instead of a scope
 *
 * Bearer REVALIDATE_SECRET only; never exposed in any client bundle.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const Body = z.object({
  scope: z.enum(["all", "home", "sellers"]).optional(),
  tags: z.array(z.string().min(1).max(200)).max(500).optional(),
});

function isAuthorised(request: NextRequest): boolean {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const secret = env.REVALIDATE_SECRET;
  if (!token || !secret) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const { scope, tags } = parsed.data;
  const done: string[] = [];

  if (tags) {
    for (const tag of tags) revalidateTag(tag, "max");
    done.push(`${tags.length} tags`);
  }

  if (scope === "home" || scope === "all") {
    revalidateHome("background");
    revalidateTag(cacheTags.categoryTree(), "max");
    revalidateTag(cacheTags.locationTree(), "max");
    done.push("home", "category-tree", "location-tree");
  }

  if (scope === "all") {
    const [categories, locations] = await Promise.all([
      db.category.findMany({ select: { id: true } }),
      db.location.findMany({ select: { id: true } }),
    ]);
    for (const { id } of categories) {
      revalidateCategory(id, "background");
      // Listing caches (/category/[slug], /[city]/category/[slug]) carry their
      // own discovery tags, not the category tag. Without these a seed run's
      // removals linger in listings for up to an hour.
      revalidateTag(cacheTags.discoveryCategory(id), "max");
    }
    for (const { id } of locations) {
      revalidateLocation(id, "background");
      revalidateTag(cacheTags.discoveryCity(id), "max");
      revalidateTag(cacheTags.popularInCity(id), "max");
    }
    done.push(`${categories.length} categories`, `${locations.length} locations`, "discovery listings");
  }

  if (scope === "sellers" || scope === "all") {
    const sellers = await db.seller.findMany({
      where: { deletedAt: null },
      select: { slug: true },
    });
    for (const { slug } of sellers) revalidateTenant(slug, "background");
    done.push(`${sellers.length} sellers`);
  }

  return NextResponse.json({ ok: true, revalidated: done });
}
