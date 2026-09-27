/**
 * GST arithmetic for plan and add-on invoices (D41). Pure — no database, no
 * Next.js — so the numbers a seller is charged are unit-tested.
 *
 * Every Bzaro price is stored EXCLUSIVE of GST in paise. The charge is
 * base + round(base × rate). Intra-state supplies split the tax into CGST +
 * SGST (half each, the odd paisa going to SGST); inter-state supplies are
 * IGST. A buyer with no state on file is treated as inter-state, which is the
 * conservative default for an online service.
 */

export const DEFAULT_GST_RATE_PERCENT = 18;

export type GstAmounts = { baseMinor: number; taxMinor: number; totalMinor: number };

export function withGst(baseMinor: number, ratePercent = DEFAULT_GST_RATE_PERCENT): GstAmounts {
  if (!Number.isInteger(baseMinor) || baseMinor < 0) {
    throw new Error("withGst: baseMinor must be a non-negative integer (paise)");
  }
  const taxMinor = Math.round((baseMinor * ratePercent) / 100);
  return { baseMinor, taxMinor, totalMinor: baseMinor + taxMinor };
}

export type GstSplit = {
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  intraState: boolean;
};

function normaliseState(state: string | null | undefined): string | null {
  const value = state?.trim().toLowerCase().replace(/\s+/g, " ");
  return value ? value : null;
}

export function splitGst(
  taxMinor: number,
  supplierState: string | null | undefined,
  recipientState: string | null | undefined,
): GstSplit {
  const a = normaliseState(supplierState);
  const b = normaliseState(recipientState);
  if (a && b && a === b) {
    const cgstMinor = Math.floor(taxMinor / 2);
    return { cgstMinor, sgstMinor: taxMinor - cgstMinor, igstMinor: 0, intraState: true };
  }
  return { cgstMinor: 0, sgstMinor: 0, igstMinor: taxMinor, intraState: false };
}

const IST_OFFSET_MS = 330 * 60 * 1000;

/** Indian financial year of a date, in IST: "2026-27" for 1 Apr 2026 – 31 Mar 2027. */
export function financialYear(date: Date): string {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  const year = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** "BZ/2026-27/0007". GST rules allow at most 16 characters of [A-Z0-9/-]. */
export function formatInvoiceNumber(prefix: string, fy: string, sequence: number): string {
  const clean =
    prefix
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, "")
      .slice(0, 4) || "BZ";
  return `${clean}/${fy}/${String(sequence).padStart(4, "0")}`;
}
