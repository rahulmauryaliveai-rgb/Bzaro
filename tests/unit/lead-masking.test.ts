import { describe, expect, it } from "vitest";
import {
  blur,
  isRevealed,
  projectLead,
  type Entitlement,
  type LeadRow,
} from "@/lib/leads/projection";

/**
 * The masking rule. This is the one place a buyer's number can leak to a
 * seller who has not paid for it, so every branch is pinned down.
 */

const now = new Date("2026-09-17T12:00:00Z");

function row(overrides: Partial<LeadRow>): LeadRow {
  return {
    id: "lead_1",
    type: "MARKET",
    status: "NEW",
    score: 100,
    expiresAt: new Date(now.getTime() + 48 * 3_600_000),
    viewedAt: null,
    acceptedAt: null,
    closedAt: null,
    sellerNote: null,
    createdAt: now,
    requirement: {
      productName: "LED Bulb 9W B22",
      quantity: 500,
      quantityUnit: "pieces",
      timeline: "WITHIN_WEEK",
      purpose: "RESALE",
      notes: "Cool white only",
      location: { name: "Mumbai" },
      category: { name: "LED Bulbs" },
      product: null,
      buyer: { phone: "+919876543210", name: "Rahul", company: "Rahul Traders" },
    },
    flag: null,
    ...overrides,
  };
}

const paid: Entitlement = {
  creditBalance: 5,
  monthlyCredits: 10,
  planName: "Silver",
  canAccept: true,
};
const paidBroke: Entitlement = {
  creditBalance: 0,
  monthlyCredits: 10,
  planName: "Silver",
  canAccept: true,
};
const free: Entitlement = {
  creditBalance: 0,
  monthlyCredits: 0,
  planName: "Free",
  canAccept: false,
};

describe("isRevealed", () => {
  it("reveals DIRECT always and MARKET only once accepted", () => {
    expect(isRevealed({ type: "DIRECT", status: "NEW" })).toBe(true);
    expect(isRevealed({ type: "MARKET", status: "NEW" })).toBe(false);
    expect(isRevealed({ type: "MARKET", status: "VIEWED" })).toBe(false);
    expect(isRevealed({ type: "MARKET", status: "ACCEPTED" })).toBe(true);
    expect(isRevealed({ type: "MARKET", status: "EXPIRED" })).toBe(false);
  });
});

describe("projectLead", () => {
  it("masks phone, name, company and notes on an unaccepted MARKET lead", () => {
    const view = projectLead(row({}), paid, now);
    expect(view.revealed).toBe(false);
    expect(view.buyer.phone).toBe("+91 98765 XXXXX");
    expect(view.buyer.name).toBeNull();
    expect(view.buyer.company).toBeNull();
    expect(view.notes).toBeNull();
    expect(view.productName).toBe("LED Bulb 9W B22"); // paid: not a teaser
    expect(view.teaser).toBe(false);
    expect(view.acceptable).toBe(true);
  });

  it("reveals everything on a DIRECT lead, and never offers accept", () => {
    const view = projectLead(row({ type: "DIRECT", expiresAt: null }), free, now);
    expect(view.revealed).toBe(true);
    expect(view.buyer).toEqual({
      phone: "+91 98765 43210",
      name: "Rahul",
      company: "Rahul Traders",
    });
    expect(view.notes).toBe("Cool white only");
    expect(view.teaser).toBe(false);
    expect(view.acceptBlockedBy).toBe("not_market");
  });

  it("reveals an accepted MARKET lead", () => {
    const view = projectLead(row({ status: "ACCEPTED" }), free, now);
    expect(view.revealed).toBe(true);
    expect(view.buyer.phone).toBe("+91 98765 43210");
    expect(view.acceptBlockedBy).toBe("status");
  });

  it("turns a MARKET lead into a blurred teaser on a plan with no credits", () => {
    const view = projectLead(row({}), free, now);
    expect(view.teaser).toBe(true);
    expect(view.productName).not.toContain("Bulb");
    expect(view.productName).toMatch(/^LED/);
    expect(view.city).toBe("Mumbai");
    expect(view.category).toBe("LED Bulbs");
    expect(view.buyer.phone).toBe("+91 98765 XXXXX");
    expect(view.acceptBlockedBy).toBe("plan");
  });

  it("is not a teaser but is not acceptable when a paid seller has spent its credits", () => {
    const view = projectLead(row({}), paidBroke, now);
    expect(view.teaser).toBe(false);
    expect(view.productName).toBe("LED Bulb 9W B22");
    expect(view.acceptable).toBe(false);
    expect(view.acceptBlockedBy).toBe("no_credits");
  });

  it("blocks accept once expiresAt has passed, even if the sweeper has not run", () => {
    const view = projectLead(row({ expiresAt: new Date(now.getTime() - 1) }), paid, now);
    expect(view.acceptBlockedBy).toBe("expired");
  });
});

describe("blur", () => {
  it("keeps enough of the first word to look relevant and hides the rest", () => {
    expect(blur("LED Bulb 9W B22")).toBe("LED •••• •• •••");
    expect(blur("Stainless Steel Pipes")).toBe("Sta•••• ••••• •••••");
    expect(blur("Rice")).toBe("Ric•");
  });
});
