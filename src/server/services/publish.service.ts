import "server-only";
import { db } from "@/lib/db";
import { forSeller } from "@/lib/db-tenant";
import { revalidateProduct } from "@/lib/cache/revalidate";
import { revalidateSellerDiscovery } from "@/server/services/discovery.service";
import { recomputeIndexability } from "@/server/services/indexability.service";
import { getModerationSignals } from "@/server/services/catalog.service";
import { decideModeration } from "@/lib/validation/moderation";

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
 * ── Moderation is unchanged ────────────────────────────────────────────────
 * D38: a verified seller's listings go live immediately, an unverified
 * seller's wait. Publishing in bulk does not alter that, and does not become a
 * way around it — the decision comes from `decideModeration` exactly as it
 * does for a single save.
 */

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
      categoryId: true,
      _count: { select: { images: true } },
    },
  });

  const ready: string[] = [];
  const skipped: Array<{ name: string; reason: string }> = [];

  for (const product of candidates) {
    if (!product.categoryId) {
      skipped.push({ name: product.name, reason: "no category" });
      continue;
    }
    if (product._count.images === 0) {
      skipped.push({ name: product.name, reason: "no photo" });
      continue;
    }
    if (product.status === "PUBLISHED") continue;
    ready.push(product.id);
  }

  if (ready.length === 0) {
    return {
      published: 0,
      skipped,
      awaitingReview: false,
      message: messageFor(0, skipped, false),
    };
  }

  const signals = await getModerationSignals(sellerId);
  const decision = decideModeration(signals);

  // `updateMany` with sellerId in the filter: the ids came from a tenant-scoped
  // read, so this is belt and braces — which is the point of layer 2.
  const result = await db.product.updateMany({
    where: { id: { in: ready }, sellerId, deletedAt: null },
    data: { status: "PUBLISHED", moderationStatus: decision.status },
  });

  // Images inherit the product's moderation state, as they do on a single
  // save — otherwise a published product's photographs stay pending and the
  // public page renders without them.
  await db.productImage.updateMany({
    where: { productId: { in: ready }, sellerId },
    data: { moderationStatus: decision.status },
  });

  // Once for the whole batch, not per product. Same reasoning as the import.
  await recomputeIndexability(sellerId).catch(() => undefined);
  revalidateProduct(sellerSlug);
  await revalidateSellerDiscovery(sellerId).catch(() => undefined);

  const awaitingReview = decision.status === "PENDING";

  return {
    published: result.count,
    skipped,
    awaitingReview,
    message: messageFor(result.count, skipped, awaitingReview),
  };
}

/**
 * What the seller is told.
 *
 * The skipped count is named with its reason, because "38 of 40 published" on
 * its own sends them looking for the two with no way to find them.
 */
function messageFor(
  published: number,
  skipped: Array<{ name: string; reason: string }>,
  awaitingReview: boolean,
): string {
  const noPhoto = skipped.filter((item) => item.reason === "no photo").length;
  const noCategory = skipped.filter((item) => item.reason === "no category").length;

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

  if (parts.length === 0) return "Nothing to publish — those products are already live.";

  return parts.join(" ");
}
