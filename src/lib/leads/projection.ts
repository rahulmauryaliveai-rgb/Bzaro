import { formatPhone, maskPhone } from "@/lib/buyer/phone";
import { PURPOSE_LABELS, TIMELINE_LABELS } from "@/lib/validation/requirement";

/**
 * The seller-facing view of a lead (docs/LEADS.md §2, "masking is a read-time
 * decision").
 *
 * Every field a seller sees passes through here. The database row carries
 * the buyer's real phone on every lead; whether it leaves the server is
 * decided by `revealed`, computed from type and status — never from the
 * `masked` column, and never by the page.
 *
 * Pure, so the rule is unit-tested in isolation.
 */

export type LeadRow = {
  id: string;
  type: "DIRECT" | "MARKET";
  status: "NEW" | "VIEWED" | "ACCEPTED" | "CLOSED" | "EXPIRED";
  score: number | null;
  expiresAt: Date | null;
  viewedAt: Date | null;
  acceptedAt: Date | null;
  closedAt: Date | null;
  sellerNote: string | null;
  createdAt: Date;
  requirement: {
    productName: string;
    quantity: number;
    quantityUnit: string;
    timeline: keyof typeof TIMELINE_LABELS;
    purpose: keyof typeof PURPOSE_LABELS;
    notes: string | null;
    location: { name: string };
    category: { name: string };
    product: { name: string; slug: string } | null;
    buyer: { phone: string; name: string | null; company: string | null };
  };
  flag: { status: "OPEN" | "REFUNDED" | "REJECTED"; reason: string } | null;
};

/** What the seller's plan lets them do with market leads. */
export type Entitlement = {
  creditBalance: number;
  monthlyCredits: number;
  planName: string;
  /** False on plans with no credits AND a zero balance → teaser mode. */
  canAccept: boolean;
};

export type LeadView = {
  id: string;
  type: "DIRECT" | "MARKET";
  status: LeadRow["status"];
  createdAt: Date;
  expiresAt: Date | null;
  /** True when the buyer's identity is shown. */
  revealed: boolean;
  /** True when this seller cannot accept at all: blur product detail, show upgrade. */
  teaser: boolean;
  /** Whether "Accept" should be offered right now. */
  acceptable: boolean;
  /** Reason acceptance is unavailable, for the UI. */
  acceptBlockedBy: null | "not_market" | "status" | "expired" | "no_credits" | "plan";
  productName: string;
  quantity: string;
  city: string;
  category: string;
  timeline: string;
  purpose: string;
  notes: string | null;
  buyer: { phone: string; name: string | null; company: string | null };
  sellerNote: string | null;
  flag: LeadRow["flag"];
  score: number | null;
};

export function isRevealed(lead: Pick<LeadRow, "type" | "status">): boolean {
  return lead.type === "DIRECT" || lead.status === "ACCEPTED";
}

export function projectLead(lead: LeadRow, entitlement: Entitlement, now = new Date()): LeadView {
  const revealed = isRevealed(lead);
  const teaser = lead.type === "MARKET" && !revealed && !entitlement.canAccept;
  const expired =
    lead.status === "EXPIRED" ||
    (lead.expiresAt !== null && lead.expiresAt.getTime() <= now.getTime());

  let acceptBlockedBy: LeadView["acceptBlockedBy"] = null;
  if (lead.type !== "MARKET") acceptBlockedBy = "not_market";
  else if (lead.status !== "NEW" && lead.status !== "VIEWED") acceptBlockedBy = "status";
  else if (expired) acceptBlockedBy = "expired";
  else if (!entitlement.canAccept) acceptBlockedBy = "plan";
  else if (entitlement.creditBalance < 1) acceptBlockedBy = "no_credits";

  const r = lead.requirement;

  return {
    id: lead.id,
    type: lead.type,
    status: lead.status,
    createdAt: lead.createdAt,
    expiresAt: lead.expiresAt,
    revealed,
    teaser,
    acceptable: acceptBlockedBy === null,
    acceptBlockedBy,
    // A teaser shows the category and city — enough to know it is relevant —
    // but not the product name, which is the part worth paying for.
    productName: teaser ? blur(r.productName) : r.productName,
    quantity: `${r.quantity} ${r.quantityUnit}`,
    city: r.location.name,
    category: r.category.name,
    timeline: TIMELINE_LABELS[r.timeline],
    purpose: PURPOSE_LABELS[r.purpose],
    notes: revealed ? r.notes : null,
    buyer: revealed
      ? { phone: formatPhone(r.buyer.phone), name: r.buyer.name, company: r.buyer.company }
      : { phone: maskPhone(r.buyer.phone), name: null, company: null },
    sellerNote: lead.sellerNote,
    flag: lead.flag,
    score: lead.score,
  };
}

/** "LED Bulb 9W B22" → "LED B••• •• •••" — first word kept for relevance. */
export function blur(text: string): string {
  const words = text.split(/\s+/);
  const first = words[0] ?? "";
  const rest = words
    .slice(1)
    .map((w) => "•".repeat(Math.min(w.length, 6)))
    .join(" ");
  const head =
    first.length > 3 ? first.slice(0, 3) + "•".repeat(Math.min(first.length - 3, 4)) : first;
  return rest ? `${head} ${rest}` : head;
}
