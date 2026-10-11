import { describe, expect, it } from "vitest";
import {
  partitionForPublish,
  publishMessage,
  REJECTED_REASON,
  type PublishCandidate,
} from "@/server/services/publish.service";
import { softDeleteProductData } from "@/server/services/catalog.service";
import { moderationForImportUpdate } from "@/server/services/import.service";

/**
 * Regressions from the review of 939e5ae (D49).
 *
 * Three of the four bugs were in rules that decide what the public sees or what
 * a seller may reuse, and all three were buried inside database-bound
 * functions where nothing could assert them. They are pure functions now, for
 * the same reason `decideModeration` is pure, and these are the executable form
 * of each rule.
 */

function candidate(overrides: Partial<PublishCandidate> = {}): PublishCandidate {
  return {
    id: "p1",
    name: "9W LED Bulb",
    status: "DRAFT",
    moderationStatus: "APPROVED",
    categoryId: "cledbulbs0000000000000001",
    imageCount: 1,
    ...overrides,
  };
}

// ── Bug 1: bulk publish was a moderation bypass ─────────────────────────────

describe("partitionForPublish", () => {
  it("publishes a ready draft", () => {
    const { ready, skipped } = partitionForPublish([candidate()]);
    expect(ready).toEqual(["p1"]);
    expect(skipped).toEqual([]);
  });

  it("REFUSES a product an admin rejected", () => {
    // The bug: bulk publish re-derived moderation from the seller's current
    // standing and stamped it onto every product. A seller who had since been
    // verified could re-publish rejected content and the write would mark it
    // APPROVED — rejected listings silently back on the public site, in bulk,
    // with nothing in the admin tools showing it happened.
    const { ready, skipped } = partitionForPublish([
      candidate({ id: "bad", name: "Rejected Thing", moderationStatus: "REJECTED" }),
    ]);

    expect(ready).toEqual([]);
    expect(skipped).toEqual([{ name: "Rejected Thing", reason: REJECTED_REASON }]);
  });

  it("REFUSES a flagged product too", () => {
    const { ready, skipped } = partitionForPublish([
      candidate({ id: "bad", moderationStatus: "FLAGGED" }),
    ]);

    expect(ready).toEqual([]);
    expect(skipped[0]!.reason).toBe(REJECTED_REASON);
  });

  it("still publishes a PENDING product, which is not a refusal", () => {
    // An unverified seller's content is PENDING and goes live the moment
    // verification lands (D38). Refusing it here would stop a new seller from
    // preparing their catalogue at all.
    const { ready } = partitionForPublish([candidate({ moderationStatus: "PENDING" })]);
    expect(ready).toEqual(["p1"]);
  });

  it("reports rejection ahead of a missing photo", () => {
    // Otherwise the seller is told to add a photograph to a product that was
    // never going to publish, and does the work for nothing.
    const { skipped } = partitionForPublish([
      candidate({ moderationStatus: "REJECTED", imageCount: 0, categoryId: null }),
    ]);

    expect(skipped).toHaveLength(1);
    expect(skipped[0]!.reason).toBe(REJECTED_REASON);
  });

  it("skips a product with no photo, and one with no category", () => {
    const { ready, skipped } = partitionForPublish([
      candidate({ id: "a", name: "No Photo", imageCount: 0 }),
      candidate({ id: "b", name: "No Category", categoryId: null }),
    ]);

    expect(ready).toEqual([]);
    expect(skipped).toEqual([
      { name: "No Photo", reason: "no photo" },
      { name: "No Category", reason: "no category" },
    ]);
  });

  it("silently ignores a product that is already published", () => {
    // Not an error and not worth a line of feedback.
    const { ready, skipped } = partitionForPublish([candidate({ status: "PUBLISHED" })]);
    expect(ready).toEqual([]);
    expect(skipped).toEqual([]);
  });

  it("partitions a realistic mixed selection", () => {
    const { ready, skipped } = partitionForPublish([
      candidate({ id: "ok1" }),
      candidate({ id: "ok2" }),
      candidate({ id: "rej", name: "Banned Item", moderationStatus: "REJECTED" }),
      candidate({ id: "nophoto", name: "Needs Photo", imageCount: 0 }),
      candidate({ id: "live", status: "PUBLISHED" }),
    ]);

    expect(ready).toEqual(["ok1", "ok2"]);
    expect(skipped.map((item) => item.reason)).toEqual([REJECTED_REASON, "no photo"]);
  });
});

describe("publishMessage", () => {
  it("names the rejected products so the seller can find them", () => {
    const message = publishMessage(
      2,
      [
        { name: "Banned Item", reason: REJECTED_REASON },
        { name: "Other Banned", reason: REJECTED_REASON },
      ],
      false,
    );

    expect(message).toContain("2 products published");
    expect(message).toContain(REJECTED_REASON);
    expect(message).toContain("Banned Item");
    expect(message).toContain("Other Banned");
    // A seller who thinks review got it wrong needs somewhere to go.
    expect(message).toContain("support");
  });

  it("caps the names rather than listing forty", () => {
    const rejected = Array.from({ length: 6 }, (_, index) => ({
      name: `Item ${index}`,
      reason: REJECTED_REASON,
    }));

    const message = publishMessage(0, rejected, false);

    expect(message).toContain("Item 0");
    expect(message).toContain("and 3 more");
    expect(message).not.toContain("Item 5");
  });

  it("says published listings are waiting when the seller is unverified", () => {
    const message = publishMessage(3, [], true);
    expect(message).toContain("verified");
  });

  it("explains a selection that was already live", () => {
    expect(publishMessage(0, [], false)).toContain("already live");
  });
});

// ── Bug 3: a deleted product held its SKU hostage ───────────────────────────

describe("softDeleteProductData", () => {
  it("releases the SKU as well as marking the row deleted", () => {
    // The bug: `UNIQUE (sellerId, sku)` does not know what `deletedAt` means,
    // so a deleted product kept its code reserved forever. Re-importing that
    // SKU failed with "a product with this code already exists", naming a
    // product the seller had deleted and could no longer see anywhere.
    const deletedAt = new Date("2026-10-11T00:00:00.000Z");
    const data = softDeleteProductData(deletedAt);

    expect(data.deletedAt).toBe(deletedAt);
    expect(data.sku).toBeNull();
  });

  it("writes nothing else", () => {
    // A soft delete must not quietly change the name, price or status — the
    // row has to stay readable for the orders that reference it.
    expect(Object.keys(softDeleteProductData(new Date())).sort()).toEqual(["deletedAt", "sku"]);
  });
});

// ── Bug 4: an imported update skipped re-review ─────────────────────────────

describe("moderationForImportUpdate", () => {
  it("sends approved content back to review when the seller lost auto-approval", () => {
    // The bug: `updateProduct` applies `editRequiresRereview`, the import did
    // not. A suspended seller could therefore edit live content through a
    // spreadsheet and keep it live, making the import the softer of two paths
    // to the same write.
    expect(moderationForImportUpdate(true, "APPROVED")).toBe("PENDING");
  });

  it("leaves approved content alone for a seller still in good standing", () => {
    expect(moderationForImportUpdate(false, "APPROVED")).toBeNull();
  });

  it("never launders a rejection into pending", () => {
    // An update must not improve a moderation decision made about the content,
    // in either direction.
    expect(moderationForImportUpdate(true, "REJECTED")).toBeNull();
    expect(moderationForImportUpdate(true, "FLAGGED")).toBeNull();
  });

  it("leaves already-pending content pending", () => {
    expect(moderationForImportUpdate(true, "PENDING")).toBeNull();
  });

  it("writes nothing for a product whose status could not be read", () => {
    expect(moderationForImportUpdate(true, null)).toBeNull();
  });
});
