"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, MessageCircle } from "lucide-react";

/**
 * The catalogue-tier seller's "website": one shareable link to their
 * marketplace page (decision D32). Copy and WhatsApp-share are the two things
 * a small business actually does with a link, so they are the two buttons.
 */
export function CatalogueLinkCard({ url, businessName }: { url: string; businessName: string }) {
  const [copied, setCopied] = useState(false);
  const display = url.replace(/^https?:\/\//, "");
  const shareText = `${businessName} — see our products and get a quote: ${url}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be unavailable (http, permissions). The link is still
      // visible and selectable, so there is nothing else to do.
    }
  }

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5">
      <h2 className="font-medium">Your catalogue page</h2>
      <p className="mt-0.5 text-sm text-neutral-600">
        Buyers see your products, business details and contact buttons here. Share it on WhatsApp,
        print it on visiting cards, add it to your Google Business profile.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm">
          {display}
        </code>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-50"
        >
          {copied ? (
            <Check className="text-accent-600 h-4 w-4" aria-hidden="true" />
          ) : (
            <Copy className="h-4 w-4" aria-hidden="true" />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-accent-600 hover:bg-accent-700 inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-white"
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          Share
        </a>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-700 hover:bg-brand-50 inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          Open
        </a>
      </div>
    </section>
  );
}
