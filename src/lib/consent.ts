/**
 * Buyer consent for sharing a requirement with sellers.
 *
 * The wording is what makes the MARKET fan-out lawful, so it is versioned and
 * the version is stored on every Requirement. Changing the text means adding a
 * new version here — never editing an existing one, because rows already point
 * at it.
 */

export const CONSENT_VERSION = "2026-09-23.v1";

export const CONSENT_TEXT =
  "By submitting, you agree that your requirement may be shared with verified " +
  "sellers on Bzaro to get you the best price.";
