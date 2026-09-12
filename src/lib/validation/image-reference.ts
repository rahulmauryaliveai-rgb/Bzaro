/**
 * What counts as a usable image address.
 *
 * One definition, shared by the seller profile, the catalogue and the gallery.
 * It previously existed as four near-identical copies, and they drifted — which
 * is how the protocol-relative hole below survived in all of them at once.
 *
 * ── Two forms are allowed ────────────────────────────────────────────────────
 *   `https://cdn…/a.jpg`  — an upload on the CDN, or a link the seller pasted
 *   `/uploads/…`          — the development media provider, which serves from
 *                           the site's own origin
 *
 * ── And one that looks allowed but is not ────────────────────────────────────
 * `//evil.example.com/x.jpg` begins with a slash, so a naive "starts with /"
 * check treats it as a local path. Browsers do not: a protocol-relative URL
 * resolves to that EXTERNAL host using the current scheme. Accepting it would
 * mean a value that passed a local-only check could still point a public page's
 * `<img src>` at somebody else's server — which is a tracking pixel at best.
 *
 * Every other scheme is rejected outright. `javascript:` and `data:` are the
 * ones that matter, since both can execute or embed content when they reach an
 * attribute the browser trusts.
 */

/** True for an address safe to place in an `src` attribute. */
export function isUsableImageReference(value: string): boolean {
  // Protocol-relative: a slash followed by another slash. Checked first, so it
  // cannot fall through to the local-path branch.
  if (value.startsWith("//")) return false;

  if (value.startsWith("/")) return true;

  return /^https?:\/\//i.test(value);
}

export const IMAGE_REFERENCE_MESSAGE = "Enter a full image URL";
