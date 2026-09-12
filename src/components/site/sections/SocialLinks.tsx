import type { SocialLinks as SocialLinksData } from "@/lib/tenant/context";

/**
 * Seller social links.
 *
 * URLs are seller-supplied, so each one is validated before rendering: only
 * http(s) is allowed, and only on the platform's own expected host. Without the
 * scheme check a `javascript:` URL in an href is a stored-XSS vector; without
 * the host check, the "LinkedIn" icon could point anywhere, which turns every
 * seller site into a potential phishing hop that borrows our domain's
 * credibility.
 */

const PLATFORMS = [
  { key: "facebook", label: "Facebook", hosts: ["facebook.com", "fb.com", "m.facebook.com"] },
  { key: "instagram", label: "Instagram", hosts: ["instagram.com"] },
  { key: "linkedin", label: "LinkedIn", hosts: ["linkedin.com"] },
  { key: "youtube", label: "YouTube", hosts: ["youtube.com", "youtu.be"] },
  { key: "x", label: "X", hosts: ["x.com", "twitter.com"] },
] as const;

function safeUrl(raw: string | undefined, hosts: readonly string[]): string | null {
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const allowed = hosts.some((h) => host === h || host.endsWith(`.${h}`));

  return allowed ? url.toString() : null;
}

export function SocialLinks({ links }: { links: SocialLinksData }) {
  const entries: Array<{ label: string; href: string }> = [];

  for (const platform of PLATFORMS) {
    const href = safeUrl(links[platform.key], platform.hosts);
    if (href) entries.push({ label: platform.label, href });
  }

  if (entries.length === 0) return null;

  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold tracking-wide uppercase opacity-70">Follow</h2>
      <ul className="flex flex-wrap gap-2">
        {entries.map((entry) => (
          <li key={entry.label}>
            <a
              href={entry.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex rounded-md border px-3 py-1.5 text-sm transition-opacity hover:opacity-70"
              style={{ borderColor: "var(--site-border)" }}
            >
              {entry.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
