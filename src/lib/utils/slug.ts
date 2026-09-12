/**
 * Slugs for catalogue items.
 *
 * These are URL PATH segments (`/products/led-panel-40w`), not hostnames, so
 * the rules differ from the subdomain rules in `src/lib/tenant/reserved.ts`:
 *
 *   - a path segment may be longer than a DNS label (63 characters)
 *   - it is never part of a TLS certificate, so dots are merely confusing
 *     rather than fatal — still rejected, because they read as file extensions
 *   - it is unique per TENANT, not globally, so two sellers may both own
 *     `led-panel-40w` on their own subdomains
 *
 * Keeping these rules in their own module rather than reusing the subdomain
 * validator prevents the tempting mistake of applying hostname constraints to
 * paths, which would reject perfectly good product names for no reason.
 */

const MIN_LENGTH = 2;
const MAX_LENGTH = 80;

/**
 * Segments the catalogue routes would shadow.
 *
 * A product at `/products/new` is unreachable in the dashboard, where `new` is
 * the create route. Rejecting these at input time is kinder than letting a
 * seller name a product something that silently 404s for them later.
 */
const RESERVED_SEGMENTS = new Set(["new", "edit", "delete", "create"]);

export type SlugCheck = { ok: true } | { ok: false; message: string };

/**
 * Derive a slug from free text.
 *
 * Diacritics are folded rather than stripped, so "Ambedkar Maṭerials" becomes
 * "ambedkar-materials" instead of losing the character entirely.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_LENGTH)
    .replace(/-+$/g, "");
}

export function checkCatalogSlug(value: string): SlugCheck {
  const slug = value.trim().toLowerCase();

  if (slug.length < MIN_LENGTH) {
    return { ok: false, message: "Web address must be at least 2 characters." };
  }

  if (slug.length > MAX_LENGTH) {
    return { ok: false, message: `Web address must be ${MAX_LENGTH} characters or fewer.` };
  }

  if (!/^[a-z0-9-]+$/.test(slug)) {
    return { ok: false, message: "Use lowercase letters, numbers and hyphens only." };
  }

  if (slug.startsWith("-") || slug.endsWith("-")) {
    return { ok: false, message: "Web address cannot start or end with a hyphen." };
  }

  if (slug.includes("--")) {
    return { ok: false, message: "Web address cannot contain two hyphens in a row." };
  }

  if (RESERVED_SEGMENTS.has(slug)) {
    return { ok: false, message: `"${slug}" is reserved. Choose another web address.` };
  }

  return { ok: true };
}

/**
 * Make a slug unique against slugs already taken within the same tenant.
 *
 * Appends `-2`, `-3`… rather than a random suffix: a seller who adds two
 * "LED Panel" products should get `led-panel` and `led-panel-2`, which stays
 * readable and guessable. Random suffixes produce URLs nobody can type.
 */
export function uniqueSlug(desired: string, taken: Iterable<string>): string {
  const existing = new Set([...taken].map((slug) => slug.toLowerCase()));
  const base = desired || "item";

  if (!existing.has(base)) return base;

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base.slice(0, MAX_LENGTH - 5)}-${suffix}`;
    if (!existing.has(candidate)) return candidate;
  }

  // A thousand collisions on one name means something is wrong upstream; a
  // timestamp is an ugly but honest fallback that cannot loop forever.
  return `${base.slice(0, MAX_LENGTH - 14)}-${Date.now().toString(36)}`;
}
