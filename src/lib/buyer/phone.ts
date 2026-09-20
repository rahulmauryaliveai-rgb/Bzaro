/**
 * Phone normalisation for the buyer OTP flow.
 *
 * Buyers type whatever their contacts app shows them: "98765 43210",
 * "09876543210", "+91 98765-43210". The OTP challenge, the Buyer row and the
 * wa.me link all need the same canonical E.164 string, so every entry point
 * runs the input through here BEFORE validation or lookup — otherwise one
 * buyer becomes three accounts and the rate limit per phone is trivially
 * bypassed by adding a space.
 *
 * India-first: a bare 10-digit number starting 6–9 is assumed to be Indian.
 * Anything else must carry its own country code with a leading "+".
 *
 * Pure. Safe to import from client components.
 */

const INDIA_CC = "91";

/** E.164 pattern, mirroring phoneSchema in validation/auth.ts. */
const E164 = /^\+[1-9]\d{7,14}$/;

/** Indian mobiles are ten digits and start with 6, 7, 8 or 9. */
const INDIAN_MOBILE = /^[6-9]\d{9}$/;

/**
 * Canonical E.164 form, or null when the input cannot be a phone number.
 *
 * Accepts: "+919876543210", "919876543210", "09876543210", "9876543210",
 * and any of those with spaces, dashes, dots or parentheses.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const hasPlus = raw.trim().startsWith("+");
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  // "00" is the international dialling prefix in most of the world.
  if (!hasPlus && digits.startsWith("00")) digits = digits.slice(2);

  if (hasPlus) {
    const candidate = `+${digits}`;
    return E164.test(candidate) ? candidate : null;
  }

  // Indian trunk prefix: 0 98765 43210.
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);

  if (INDIAN_MOBILE.test(digits)) return `+${INDIA_CC}${digits}`;

  // 91 98765 43210 without the plus.
  if (digits.length === 12 && digits.startsWith(INDIA_CC) && INDIAN_MOBILE.test(digits.slice(2))) {
    return `+${digits}`;
  }

  return null;
}

/**
 * "+919876543210" → "+91 98765 XXXXX". What a seller sees on a masked
 * MARKET lead: enough to tell it is a real Indian mobile, not enough to call.
 */
export function maskPhone(e164: string): string {
  if (e164.startsWith(`+${INDIA_CC}`) && e164.length === 13) {
    return `+${INDIA_CC} ${e164.slice(3, 8)} XXXXX`;
  }
  const visible = e164.slice(0, Math.max(3, e164.length - 5));
  return `${visible}${"X".repeat(e164.length - visible.length)}`;
}

/** "+919876543210" → "+91 98765 43210" for display. */
export function formatPhone(e164: string): string {
  if (e164.startsWith(`+${INDIA_CC}`) && e164.length === 13) {
    return `+${INDIA_CC} ${e164.slice(3, 8)} ${e164.slice(8)}`;
  }
  return e164;
}
