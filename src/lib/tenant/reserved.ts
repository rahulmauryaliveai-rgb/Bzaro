/**
 * Reserved subdomain labels and slug validation.
 *
 * A seller's slug IS their subdomain, so slug validation is a routing and
 * security concern, not a cosmetic one:
 *
 *  - A slug that collides with an infrastructure hostname (`www`, `api`, `mail`)
 *    would shadow that service for the whole platform.
 *  - A slug containing a dot produces `a.b.bzaro.in`, which a one-level
 *    wildcard certificate does not cover — the site would fail TLS entirely.
 *  - A slug that looks like a platform surface (`admin`, `support`, `billing`)
 *    is a phishing vector against the platform's own users.
 *
 * The database enforces the character format independently via the
 * `Seller_slug_format` CHECK constraint. This module is the friendly layer that
 * produces useful errors before the write is attempted.
 */

/** Infrastructure and protocol hostnames. Squatting these breaks the platform. */
const INFRASTRUCTURE = [
  "www",
  "api",
  "app",
  "admin",
  "dashboard",
  "cdn",
  "static",
  "assets",
  "media",
  "img",
  "images",
  "files",
  "download",
  "downloads",
  "upload",
  "uploads",
  "mail",
  "email",
  "smtp",
  "imap",
  "pop",
  "pop3",
  "webmail",
  "mx",
  "ns",
  "ns1",
  "ns2",
  "ns3",
  "ns4",
  "dns",
  "mta-sts",
  "autoconfig",
  "autodiscover",
  "ftp",
  "sftp",
  "ssh",
  "vpn",
  "proxy",
  "gateway",
  "router",
  "localhost",
  "test",
  "testing",
  "dev",
  "development",
  "stage",
  "staging",
  "preview",
  "demo",
  "sandbox",
  "beta",
  "alpha",
  "canary",
  "edge",
  "internal",
  "local",
] as const;

/** Platform surfaces. Reserved so a tenant cannot impersonate the platform. */
const PLATFORM = [
  "about",
  "account",
  "accounts",
  "auth",
  "login",
  "signin",
  "signup",
  "register",
  "logout",
  "password",
  "reset",
  "verify",
  "verification",
  "onboarding",
  "billing",
  "invoice",
  "invoices",
  "payment",
  "payments",
  "checkout",
  "pricing",
  "plans",
  "subscribe",
  "subscription",
  "upgrade",
  "renew",
  "help",
  "support",
  "contact",
  "docs",
  "documentation",
  "guide",
  "guides",
  "faq",
  "blog",
  "news",
  "press",
  "careers",
  "jobs",
  "legal",
  "privacy",
  "terms",
  "security",
  "status",
  "health",
  "monitor",
  "metrics",
  "analytics",
  "insights",
  "search",
  "explore",
  "browse",
  "categories",
  "category",
  "locations",
  "location",
  "sellers",
  "seller",
  "products",
  "product",
  "services",
  "service",
  "enquiry",
  "enquiries",
  "leads",
  "reviews",
  "sitemap",
  "robots",
  "feed",
  "rss",
  "partner",
  "partners",
  "affiliate",
  "affiliates",
  "referral",
  "invite",
  "marketplace",
  "official",
  "verified",
  "trust",
  "safety",
  "report",
  "abuse",
  "moderation",
  "team",
  "staff",
  "root",
  "system",
  "config",
  "settings",
] as const;

/**
 * Labels that are confusable with the platform's own branding. Kept separate so
 * the list can grow with the brand without touching the categories above.
 */
const BRAND_PROTECTED = ["marketplace", "indiamart", "shop", "store", "buy", "sell"] as const;

export const RESERVED_SUBDOMAINS: ReadonlySet<string> = new Set<string>([
  ...INFRASTRUCTURE,
  ...PLATFORM,
  ...BRAND_PROTECTED,
]);

export const SLUG_MIN_LENGTH = 3;
/** DNS labels are capped at 63 octets by RFC 1035. */
export const SLUG_MAX_LENGTH = 63;

/**
 * Lowercase alphanumeric with internal hyphens. Must start and end
 * alphanumeric. Mirrors the `Seller_slug_format` CHECK constraint exactly —
 * if you change one, change both.
 */
export const SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/;

/**
 * Labels beginning `xn--` are IDN punycode. Allowing sellers to register these
 * enables homograph attacks against other tenants, so they are rejected.
 */
const PUNYCODE_PREFIX = /^xn--/i;

/** Consecutive hyphens in positions 3-4 are reserved by RFC 5891. */
const RFC5891_RESERVED = /^..--/;

export type SlugRejection =
  "too_short" | "too_long" | "invalid_characters" | "reserved" | "punycode" | "rfc5891_reserved";

export type SlugCheck = { ok: true } | { ok: false; reason: SlugRejection; message: string };

/**
 * Validate a candidate subdomain label. Pure and synchronous — uniqueness is a
 * separate database concern, checked by the seller service.
 */
export function checkSlug(raw: string): SlugCheck {
  const slug = raw.trim().toLowerCase();

  if (slug.length < SLUG_MIN_LENGTH) {
    return {
      ok: false,
      reason: "too_short",
      message: `Must be at least ${SLUG_MIN_LENGTH} characters.`,
    };
  }

  if (slug.length > SLUG_MAX_LENGTH) {
    return {
      ok: false,
      reason: "too_long",
      message: `Must be ${SLUG_MAX_LENGTH} characters or fewer.`,
    };
  }

  if (!SLUG_PATTERN.test(slug)) {
    return {
      ok: false,
      reason: "invalid_characters",
      message:
        "Use lowercase letters, numbers and hyphens only. It must start and end with a letter or number, and cannot contain dots.",
    };
  }

  if (PUNYCODE_PREFIX.test(slug)) {
    return {
      ok: false,
      reason: "punycode",
      message: "Internationalised domain names are not available.",
    };
  }

  if (RFC5891_RESERVED.test(slug) && !PUNYCODE_PREFIX.test(slug)) {
    return {
      ok: false,
      reason: "rfc5891_reserved",
      message: "Cannot have two hyphens in the third and fourth positions.",
    };
  }

  if (RESERVED_SUBDOMAINS.has(slug)) {
    return { ok: false, reason: "reserved", message: "This address is reserved." };
  }

  return { ok: true };
}

/** True when the label is reserved. Used by the proxy for its fast path. */
export function isReservedSubdomain(label: string): boolean {
  return RESERVED_SUBDOMAINS.has(label.toLowerCase());
}
