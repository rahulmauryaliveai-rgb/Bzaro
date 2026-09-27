import { describe, expect, it } from "vitest";
import { financialYear, formatInvoiceNumber, splitGst, withGst } from "@/lib/billing/gst";
import { billingSettingsSchema } from "@/lib/validation/billing-settings";

/**
 * D41 money: what a seller is charged for each plan and add-on, how the GST
 * splits on the invoice, and invoice numbering. A paisa off here is a wrong
 * tax invoice, so the plan prices are pinned exactly.
 */

describe("withGst", () => {
  it.each([
    ["Pro monthly", 99_900, 17_982, 117_882],
    ["Pro yearly", 999_900, 179_982, 1_179_882],
    ["Gold monthly", 299_900, 53_982, 353_882],
    ["Gold yearly", 2_500_000, 450_000, 2_950_000],
    ["Lead pack", 49_900, 8_982, 58_882],
    ["Payment gateway add-on", 200_000, 36_000, 236_000],
    ["Shipping add-on", 500_000, 90_000, 590_000],
  ])("%s", (_label, base, tax, total) => {
    expect(withGst(base)).toEqual({ baseMinor: base, taxMinor: tax, totalMinor: total });
  });

  it("rounds to the nearest paisa", () => {
    expect(withGst(333, 18).taxMinor).toBe(60); // 59.94
  });

  it("refuses fractional or negative paise", () => {
    expect(() => withGst(10.5)).toThrow();
    expect(() => withGst(-1)).toThrow();
  });
});

describe("splitGst", () => {
  it("splits intra-state tax into CGST + SGST, odd paisa to SGST", () => {
    expect(splitGst(17_983, "Uttar Pradesh", " uttar  pradesh ")).toEqual({
      cgstMinor: 8_991,
      sgstMinor: 8_992,
      igstMinor: 0,
      intraState: true,
    });
  });

  it("uses IGST across states and when the recipient's state is unknown", () => {
    expect(splitGst(17_982, "Uttar Pradesh", "Delhi").igstMinor).toBe(17_982);
    expect(splitGst(17_982, "Uttar Pradesh", null).intraState).toBe(false);
    expect(splitGst(17_982, null, "Delhi").intraState).toBe(false);
  });
});

describe("financialYear", () => {
  it("rolls over at midnight IST on 1 April", () => {
    // 31 Mar 2027 23:59 IST = 18:29 UTC
    expect(financialYear(new Date("2027-03-31T18:29:00Z"))).toBe("2026-27");
    // 1 Apr 2027 00:00 IST = 31 Mar 18:30 UTC
    expect(financialYear(new Date("2027-03-31T18:30:00Z"))).toBe("2027-28");
  });

  it("handles the century-style suffix", () => {
    expect(financialYear(new Date("2099-06-01T00:00:00Z"))).toBe("2099-00");
  });
});

describe("formatInvoiceNumber", () => {
  it("pads the sequence and cleans the prefix", () => {
    expect(formatInvoiceNumber("bz", "2026-27", 7)).toBe("BZ/2026-27/0007");
    expect(formatInvoiceNumber("b z!", "2026-27", 12345)).toBe("BZ/2026-27/12345");
    expect(formatInvoiceNumber("", "2026-27", 1)).toBe("BZ/2026-27/0001");
  });
});

describe("billingSettingsSchema", () => {
  it("still parses a row saved before D41, filling the new defaults", () => {
    const parsed = billingSettingsSchema.parse({
      supportWhatsapp: "919876543210",
      supportEmail: "",
      upiId: "bzaro@upi",
      instructions: "Pay and tell us.",
    });
    expect(parsed.supportWhatsapp).toBe("919876543210");
    expect(parsed.leadPackPriceMinor).toBe(49_900);
    expect(parsed.paymentGatewayAddonMinor).toBe(200_000);
    expect(parsed.shippingAddonMinor).toBe(500_000);
    expect(parsed.graceDays).toBe(3);
    expect(parsed.refundWindowDays).toBe(7);
    expect(parsed.gstRatePercent).toBe(18);
    expect(parsed.gstin).toBeNull();
  });
});
