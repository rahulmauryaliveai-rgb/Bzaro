/**
 * Money formatting.
 *
 * Everything is stored as integer minor units (paise for INR) plus a currency
 * code. Floats are never used for money: 0.1 + 0.2 !== 0.3, and a marketplace
 * that quietly mis-sums prices loses seller trust in a way that is very hard to
 * win back.
 *
 * `Intl.NumberFormat` handles the Indian digit grouping convention (1,23,456
 * rather than 123,456) correctly for the `en-IN` locale, which matters more
 * here than it would elsewhere — Western grouping reads as foreign to the
 * buyers this platform serves.
 */

export type Price = {
  minor: number | null;
  maxMinor?: number | null;
  currency: string;
  unit?: string | null;
  onRequest: boolean;
};

const MINOR_UNITS: Record<string, number> = {
  INR: 100,
  USD: 100,
  EUR: 100,
  GBP: 100,
  AED: 100,
  JPY: 1,
};

function divisorFor(currency: string): number {
  return MINOR_UNITS[currency.toUpperCase()] ?? 100;
}

function localeFor(currency: string): string {
  return currency.toUpperCase() === "INR" ? "en-IN" : "en-US";
}

/** Format a single amount, e.g. 12500 INR → "₹125". */
export function formatMoney(minor: number, currency = "INR"): string {
  const value = minor / divisorFor(currency);

  return new Intl.NumberFormat(localeFor(currency), {
    style: "currency",
    currency: currency.toUpperCase(),
    // Whole rupees read better in a B2B catalogue; show paise only when the
    // price actually has them.
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Render a catalogue price.
 *
 * "Price on request" is the DEFAULT for this market, not an edge case — B2B
 * sellers routinely quote per enquiry. Treating it as a first-class state
 * rather than an empty string is what keeps product cards from looking broken.
 */
export function formatPrice(price: Price): string {
  if (price.onRequest || price.minor === null) return "Price on request";

  const base = formatMoney(price.minor, price.currency);
  const suffix = price.unit ? ` / ${price.unit}` : "";

  if (price.maxMinor && price.maxMinor > price.minor) {
    return `${base} – ${formatMoney(price.maxMinor, price.currency)}${suffix}`;
  }

  return `${base}${suffix}`;
}

/** Numeric value for structured data, which wants a plain decimal string. */
export function priceForSchema(minor: number, currency = "INR"): string {
  return (minor / divisorFor(currency)).toFixed(currency.toUpperCase() === "JPY" ? 0 : 2);
}

/**
 * Parse a seller-entered amount in MAJOR units into integer minor units.
 *
 * Sellers type "1250" or "1,250.50" or "₹1250"; the database stores 125000.
 * Returns `null` for empty input (meaning "no price given") and `undefined`
 * for input that is not a number at all, so a caller can tell "left blank"
 * apart from "typed nonsense" and report the second as a validation error
 * rather than silently clearing the price.
 *
 * Rounds rather than truncates: 10.005 → 1001 paise, not 1000. Truncation
 * quietly loses money in the seller's disfavour on every edit.
 */
export function parseMoneyToMinor(
  raw: string | null | undefined,
  currency = "INR",
): number | null | undefined {
  if (raw === null || raw === undefined) return null;

  const cleaned = String(raw)
    .replace(/[₹$€£,\s]/g, "")
    .trim();

  if (cleaned === "") return null;
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return undefined;

  const amount = Number(cleaned);
  if (!Number.isFinite(amount)) return undefined;

  return Math.round(amount * divisorFor(currency));
}

/** Inverse of `parseMoneyToMinor`, for pre-filling an edit form. */
export function minorToMajorString(minor: number | null | undefined, currency = "INR"): string {
  if (minor === null || minor === undefined) return "";

  const divisor = divisorFor(currency);
  const major = minor / divisor;

  // Whole amounts render without a decimal tail: a seller who typed 1250 should
  // see 1250 when they come back, not 1250.00.
  return Number.isInteger(major) ? String(major) : major.toFixed(2);
}
