/**
 * Who gets auto-approved, and who waits.
 *
 * Decision D38 (supersedes the content half of D10): the platform verifies
 * the BUSINESS, not each listing. Once an admin has verified a seller, every
 * product, service and gallery item they publish goes live immediately — no
 * per-item review queue. Before verification nothing of theirs is public
 * anyway; verifying the seller releases everything they have already added
 * (admin.service `verifySeller`).
 *
 * Admin keeps the after-the-fact tools: reject or flag an individual item,
 * suspend a seller. Those are reactive, not a gate.
 *
 * Pure: takes plain counts so it can be unit-tested without a database.
 */

export type ModerationSignals = {
  /** Only a verified business publishes. */
  sellerStatus: string;
  /** Kept for callers and dashboards; no longer decides anything. */
  approvedItems: number;
  rejectedItems: number;
  flaggedItems: number;
};

export type ModerationDecision = {
  status: "PENDING" | "APPROVED";
  /** Shown to the seller, so "why is my product not live" is never a mystery. */
  reason: string;
};

/** Whether this seller's next piece of content goes live immediately. */
export function decideModeration(signals: ModerationSignals): ModerationDecision {
  if (signals.sellerStatus !== "VERIFIED") {
    return {
      status: "PENDING",
      reason:
        "Your listings go live as soon as your business is verified — usually within one working day. You can keep adding products meanwhile.",
    };
  }
  return { status: "APPROVED", reason: "Published immediately." };
}

/**
 * Whether an EDIT to already-approved content should return it to review.
 * Only when the seller is no longer verified (suspended, for instance).
 */
export function editRequiresRereview(signals: ModerationSignals, currentStatus: string): boolean {
  if (currentStatus !== "APPROVED") return false;
  return decideModeration(signals).status === "PENDING";
}
