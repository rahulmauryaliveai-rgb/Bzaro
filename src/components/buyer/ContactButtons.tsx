"use client";

import { useState } from "react";
import {
  ContactIntentModal,
  type CityOption,
  type ContactIntentKind,
  type ContactTarget,
} from "./ContactIntentModal";

/**
 * The two contact-intent triggers: "Enquire on WhatsApp" and "Get Best Price".
 *
 * Both open the same modal; the intent only changes the heading. The WhatsApp
 * button is hidden when the seller has no usable number — a dead WhatsApp
 * button reads as a fake seller — but "Get Best Price" always shows, because
 * the lead still reaches the seller's dashboard.
 *
 * Replaces the plain wa.me link on marketplace and microsite product pages.
 * A buyer never reaches WhatsApp without leaving a requirement behind, which
 * is what makes the lead exist for the seller's inbox and the market fan-out.
 */
export function ContactButtons({
  target,
  cities,
  className,
  show = "both",
  whatsappClassName,
  priceClassName,
  priceLabel = "Get Best Price",
}: {
  target: ContactTarget;
  cities: CityOption[];
  className?: string;
  /** Which triggers to render — storefront chrome often wants just one. */
  show?: "both" | "whatsapp" | "price";
  whatsappClassName?: string;
  priceClassName?: string;
  priceLabel?: string;
}) {
  const [intent, setIntent] = useState<ContactIntentKind | null>(null);
  const showWhatsApp = target.sellerHasWhatsApp && show !== "price";
  // With no WhatsApp number the "whatsapp only" slot still needs a trigger,
  // otherwise a header loses its one call to action.
  const showPrice = show === "both" || show === "price" || !target.sellerHasWhatsApp;

  return (
    <div className={className ?? "flex flex-wrap gap-3"}>
      {showWhatsApp ? (
        <button
          type="button"
          onClick={() => setIntent("whatsapp")}
          className={
            whatsappClassName ??
            "inline-flex items-center gap-2 rounded-md bg-[#25D366] px-4 py-2 text-sm font-medium text-white hover:bg-[#1eb855]"
          }
        >
          <WhatsAppGlyph />
          Enquire on WhatsApp
        </button>
      ) : null}

      {target.sellerHasPhone && show === "both" ? (
        <button
          type="button"
          onClick={() => setIntent("call")}
          className="inline-flex min-h-11 items-center gap-2 rounded-md border border-neutral-300 px-4 text-sm font-medium text-neutral-900 hover:bg-neutral-50"
        >
          Show number
        </button>
      ) : null}

      {showPrice ? (
        <button
          type="button"
          onClick={() => setIntent("price")}
          className={
            priceClassName ??
            "inline-flex items-center rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          }
        >
          {priceLabel}
        </button>
      ) : null}

      <ContactIntentModal
        open={intent !== null}
        onClose={() => setIntent(null)}
        target={target}
        cities={cities}
        intent={intent ?? "price"}
      />
    </div>
  );
}

function WhatsAppGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2Zm0 18.15a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.24-8.23a8.24 8.24 0 0 1 0 16.47Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.79.97-.14.16-.29.18-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.48c-.16 0-.43.06-.65.31-.22.25-.85.83-.85 2.02s.87 2.34.99 2.51c.12.16 1.71 2.61 4.15 3.66.58.25 1.03.4 1.39.51.58.19 1.11.16 1.53.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.11-.22-.17-.47-.29Z" />
    </svg>
  );
}
