/**
 * Who gets auto-approved, and who waits for review.
 *
 * Implements the moderation half of D10: content from NEW sellers defaults to
 * `PENDING`, and sellers with a clean history auto-approve.
 *
 * ── Why trust is earned rather than granted ──────────────────────────────────
 * Pre-moderating every listing does not survive 10,000 sellers with one
 * founder. Post-moderating everything means the first spam listing is public
 * before anyone sees it. The middle path is to make a seller clear review once,
 * then trust them until they give a reason not to.
 *
 * This module is pure and takes plain counts so it can be unit-tested without a
 * database, in the same spirit as `index-eligibility.ts`.
 */

export type ModerationSignals = {
  /** Only a verified business can ever auto-approve. */
  sellerStatus: string;
  /** Items this seller has had approved before — evidence of a clean pass. */
  approvedItems: number;
  /** Items ever rejected. A single rejection returns them to review. */
  rejectedItems: number;
  /** Items currently flagged, by a report or by automated screening. */
  flaggedItems: number;
};

export type ModerationDecision = {
  status: "PENDING" | "APPROVED";
  /** Shown to the seller, so "why is my product not live" is never a mystery. */
  reason: string;
};

/**
 * Whether this seller's next piece of content goes live immediately.
 *
 * Note the asymmetry: earning trust needs several signals to line up, losing it
 * needs one. That is deliberate — the cost of a wrongly-trusted spam listing is
 * paid by every buyer who sees it, while the cost of a wrongly-untrusted seller
 * is one review cycle.
 */
export function decideModeration(signals: ModerationSignals): ModerationDecision {
  if (signals.flaggedItems > 0) {
    return {
      status: "PENDING",
      reason: "Some of your content is under review, so new items are checked before going live.",
    };
  }

  if (signals.rejectedItems > 0) {
    return {
      status: "PENDING",
      reason: "Because something of yours was rejected previously, new items are reviewed first.",
    };
  }

  if (signals.sellerStatus !== "VERIFIED") {
    return {
      status: "PENDING",
      reason: "New items are reviewed before they appear publicly until your business is verified.",
    };
  }

  if (signals.approvedItems < 1) {
    return {
      status: "PENDING",
      reason: "Your first listing is reviewed before it goes live. Later ones appear immediately.",
    };
  }

  return { status: "APPROVED", reason: "Published immediately." };
}

/**
 * Whether an EDIT to already-approved content should return it to review.
 *
 * Without this, moderation is trivially bypassed: publish something innocuous,
 * wait for approval, then edit it into anything at all. Sellers who have earned
 * trust keep their approval through edits — that is what the trust is for.
 */
export function editRequiresRereview(
  signals: ModerationSignals,
  currentStatus: string,
): boolean {
  if (currentStatus !== "APPROVED") return false;
  return decideModeration(signals).status === "PENDING";
}
