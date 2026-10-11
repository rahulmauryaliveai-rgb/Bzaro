import "server-only";
import { db } from "@/lib/db";
import { forSeller } from "@/lib/db-tenant";
import { revalidateProduct } from "@/lib/cache/revalidate";
import { revalidateSellerDiscovery } from "@/server/services/discovery.service";
import { recomputeIndexability } from "@/server/services/indexability.service";

/**
 * Publishing several products at once (D49).
 *
 * Bulk upload creates drafts, so the step after it is publishing forty
 * products — which the one-at-a-time control on the list cannot reasonably do.
 *
 * ── Readiness is enforced here, not in the UI ──────────────────────────────
 * A product with no category is unreachable by every buyer who browses, and a
 * product with no photograph looks broken next to ones that have them. The
 * list greys out the checkbox for those, but the rule lives here because the
 * list is a hint and this is a POST endpoint. Posting the ids directly gets
 * the same refusal.
 *
 * ── This NEVER touches moderationStatus ───────────────────────────────────
 * It changes `status` and nothing else, exactly like `setCatalogStatus`.
 *
 * An earlier version re-derived moderation from `decideModeration()` on every
 * publish, which was a moderation bypass: a seller who had since become
 * verified could re-publish a product an admin had REJECTED or FLAGGED and the
 * write would stamp it APPROVED. Rejected content would silently return to the
 * public site, in bulk, with nothing in the admin tools to show it had
 * happened.
 *
 * Moderation is a decision made ABOUT a seller's content by someone else.
 * Publishing is the seller saying "show this". The second must never be able
 * to overwrite the first, so rejected and flagged products are skipped here
 * and reported back by name.
 */

/**
 * Shown for a product an admin has rejected or flagged.
 *
 * Deliberately names Bzaro rather than saying "not allowed": the seller needs
 * to know the decision came from review and is not something they can fix by
 * editing the row, and support needs them to arrive saying "review rejected
 * my product" rather than "publish is broken".
 */
export const REJECTED_REASON = "rejected by Bzaro review";

/** One candidate, as the publish decision needs to see it. */
export type PublishCandidate = {
  id: string;
  name: string;
  status: string;
  moderationStatus: string;
  categoryId: string | null;
  imageCount: number;
};

/**
 * Which products may be published, and why the rest may not.
 *
 * Pure, and separated from the write for the same reason `decideModeration` is:
 * this is the rule that decides what reaches the public, and it should be
 * assertable without a database. `tests/unit/publish.test.ts` is the executable
 * form of it.
 */
export function partitionForPublish(candidates: readonly PublishCandidate[]): {
  ready: string[];
  skipped: Array<{ name: string; reason: string }>;
} {
  const ready: string[] = [];
  const skipped: Array<{ name: string; reason: string }> = [];

  for (const product of candidates) {
    // Checked FIRST, before the readiness rules: a rejected product is not
    // "nearly publishable pending a photo", it is content an admin has
    // refused, and saying so is more use to the seller than a note about a
    // missing photograph they would then go and add for nothing.
    if (product.moderationStatus === "REJECTED" || product.moderationStatus === "FLAGGED") {
      skipped.push({ name: product.name, reason: REJECTED_REASON });
      continue;
    }
    if (!product.categoryId) {
      skipped.push({ name: product.name, reason: "no category" });
      continue;
    }
    if (product.imageCount === 0) {
      skipped.push({ name: product.name, reason: "no photo" });
      continue;
    }
    // Already live: not an error and not worth reporting.
    if (product.status === "PUBLISHED") continue;
    ready.push(product.id);
  }

  return { ready, skipped };
}

export type PublishResult = {
  published: number;
  /** Products that were not ready, with why. */
  skipped: Array<{ name: string; reason: string }>;
  message: string;
  /** True when the seller is not yet verified, so these are queued. */
  awaitingReview: boolean;
};

export async function publishProducts(input: {
  sellerId: string;
  sellerSlug: string;
  productIds: string[];
}): Promise<PublishResult> {
  const { sellerId, sellerSlug, productIds } = input;
  const tdb = forSeller(sellerId);

  // Read through the tenant client, so an id belonging to another seller is
  // simply not in the result — it is never "found and refused".
  const candidates = await tdb.product.findMany({
    where: { id: { in: productIds }, deletedAt: null },
    select: {
      id: true,
      name: true,
      status: true,
      // Read so a rejected product can be skipped. Never written back.
      moderationStatus: true,
      categoryId: true,
      _count: { select: { images: true } },
    },
  });

  const { ready, skipped } = partitionForPublish(
    candidates.map((product) => ({
      id: product.id,
      name: product.name,
      status: product.status,
      moderationStatus: product.moderationStatus,
      categoryId: product.categoryId,
      imageCount: product._count.images,
    })),
  );

  if (ready.length === 0) {
    return {
      published: 0,
      skipped,
      awaitingReview: false,
      message: publishMessage(0, skipped, false),
    };
  }

  // `updateMany` with sellerId in the filter: the ids came from a tenant-scoped
  // read, so this is belt and braces — which is the point of layer 2.
  //
  // `status` is the ONLY column written. No moderationStatus on the product and
  // none on its images — see the note at the top of this file.
  const result = await db.product.updateMany({
    where: { id: { in: ready }, sellerId, deletedAt: null },
    data: { status: "PUBLISHED" },
  });

  // Once for the whole batch, not per product. Same reasoning as the import.
  await recomputeIndexability(sellerId).catch(() => undefined);
  revalidateProduct(sellerSlug);
  await revalidateSellerDiscovery(sellerId).catch(() => undefined);

  // Whether these are publicly visible YET is a property the products already
  // carry, so it is read back rather than decided here. An unverified seller's
  // products are PENDING and stay PENDING; publishing just means they go live
  // the moment verification lands (D38).
  const awaitingReview = await db.product.count({
    where: { id: { in: ready }, sellerId, moderationStatus: { not: "APPROVED" } },
  });

  return {
    published: result.count,
    skipped,
    awaitingReview: awaitingReview > 0,
    message: publishMessage(result.count, skipped, awaitingReview > 0),
  };
}

/**
 * What the seller is told.
 *
 * The skipped count is named with its reason, because "38 of 40 published" on
 * its own sends them looking for the two with no way to find them.
 */
export function publishMessage(
  published: number,
  skipped: Array<{ name: string; reason: string }>,
  awaitingReview: boolean,
): string {
  const noPhoto = skipped.filter((item) => item.reason === "no photo").length;
  const noCategory = skipped.filter((item) => item.reason === "no category").length;
  const rejected = skipped.filter((item) => item.reason === REJECTED_REASON);

  const parts: string[] = [];

  if (published > 0) {
    parts.push(
      awaitingReview
        ? `${published} product${published === 1 ? "" : "s"} will go live as soon as your business is verified.`
        : `${published} product${published === 1 ? "" : "s"} published.`,
    );
  }

  if (noPhoto > 0) {
    parts.push(
      `${noPhoto} need${noPhoto === 1 ? "s" : ""} a photo first — use the "Missing photos" filter to find them.`,
    );
  }

  if (noCategory > 0) {
    parts.push(`${noCategory} need${noCategory === 1 ? "s" : ""} a category.`);
  }

  // Named individually, up to a point: "1 was rejected" leaves the seller
  // hunting through forty products for it.
  if (rejected.length > 0) {
    const names = rejected
      .slice(0, 3)
      .map((item) => item.name)
      .join(", ");
    const more = rejected.length > 3 ? ` and ${rejected.length - 3} more` : "";
    parts.push(
      `${rejected.length} cannot be published because ${rejected.length === 1 ? "it was" : "they were"} ${REJECTED_REASON} (${names}${more}). Contact support if you think this is a mistake.`,
    );
  }

  if (parts.length === 0) return "Nothing to publish — those products are already live.";

  return parts.join(" ");
}
