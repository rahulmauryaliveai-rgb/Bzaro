import { ImageResponse } from "next/og";
import { resolveTenant } from "@/lib/tenant/resolve";
import { clientEnv } from "@/env.client";

/**
 * Open Graph image for a seller's microsite.
 *
 * Generated rather than uploaded, because sellers will not make one and a
 * missing OG image means every WhatsApp and LinkedIn share of their site looks
 * broken — which matters more here than on most platforms, since WhatsApp is
 * the primary sharing channel for this market.
 *
 * Deliberately typographic: no remote images. Fetching a seller's logo here
 * would make image generation depend on a third-party CDN being up, and a slow
 * or failed fetch would stall the response for a crawler that waits only a
 * couple of seconds.
 */

export const runtime = "nodejs";
export const alt = "Business profile";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const result = await resolveTenant(tenant);

  const businessName = result.kind === "found"
      ? result.tenant.seller.businessName
      : clientEnv.NEXT_PUBLIC_PLATFORM_NAME;
  const tagline = result.kind === "found" ? result.tenant.seller.tagline : null;
  const locality =
    result.kind === "found"
      ? [result.tenant.seller.address.city, result.tenant.seller.address.state]
          .filter(Boolean)
          .join(", ")
      : null;

  // Long business names must shrink rather than overflow the canvas.
  const titleSize = businessName.length > 30 ? 64 : businessName.length > 18 ? 80 : 96;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#0f1315",
        color: "#e4eaea",
        padding: "72px",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column" }}>
        {locality ? (
          <div style={{ fontSize: 28, color: "#4fbfa6", letterSpacing: 2, marginBottom: 24 }}>
            {locality.toUpperCase()}
          </div>
        ) : null}

        <div style={{ fontSize: titleSize, fontWeight: 700, lineHeight: 1.1 }}>{businessName}</div>

        {tagline ? (
          <div style={{ fontSize: 34, color: "#9aa7ab", marginTop: 24, lineHeight: 1.3 }}>
            {tagline.length > 90 ? `${tagline.slice(0, 90)}…` : tagline}
          </div>
        ) : null}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 26,
          color: "#76858a",
          borderTop: "1px solid #283234",
          paddingTop: 28,
        }}
      >
        <span>{clientEnv.NEXT_PUBLIC_PLATFORM_NAME}</span>
        {result.kind === "found" && result.tenant.seller.isVerified ? (
          <span style={{ color: "#4fbfa6" }}>✓ Verified supplier</span>
        ) : null}
      </div>
    </div>,
    size,
  );
}
