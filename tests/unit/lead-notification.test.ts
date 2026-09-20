import { describe, expect, it, vi } from "vitest";

// The service module imports db and the notifier for the drain; the pure
// builder under test needs neither.
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/notify", () => ({
  leadNotifier: { name: "fake", notify: async () => ({ ok: true }) },
}));

const { buildNotification } = await import("@/server/services/delivery.service");

const requirement = {
  productName: "LED Bulb 9W",
  quantity: 500,
  quantityUnit: "pieces",
  timeline: "WITHIN_WEEK" as const,
  purpose: "RESALE" as const,
  notes: "Cool white only",
  location: { name: "Mumbai" },
  buyer: { phone: "+919876543210", name: "Rahul" },
};

describe("buildNotification", () => {
  it("masks the buyer for MARKET leads — number, name and notes", () => {
    const n = buildNotification({
      leadId: "lead_1",
      leadType: "MARKET",
      sellerName: "ABC",
      to: "+919999999999",
      requirement,
    });
    expect(n.summary).not.toContain("43210");
    expect(n.summary).toContain("+91 98765 XXXXX");
    expect(n.summary).not.toContain("Rahul");
    expect(n.summary).not.toContain("Cool white");
    expect(n.summary).toContain("accept in your dashboard");
    expect(n.dashboardUrl).toContain("/dashboard/leads/lead_1");
  });

  it("reveals the buyer for DIRECT leads", () => {
    const n = buildNotification({
      leadId: "lead_2",
      leadType: "DIRECT",
      sellerName: "ABC",
      to: null,
      requirement,
    });
    expect(n.summary).toContain("Rahul (+91 98765 43210)");
    expect(n.summary).toContain("Notes: Cool white only");
    expect(n.to).toBeNull();
  });

  it("drops an unusable seller number rather than passing it on", () => {
    const n = buildNotification({
      leadId: "lead_3",
      leadType: "DIRECT",
      sellerName: "ABC",
      to: "12",
      requirement,
    });
    expect(n.to).toBeNull();
  });
});
