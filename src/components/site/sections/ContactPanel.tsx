import type { SellerPublic } from "@/lib/tenant/context";
import { WhatsAppButton } from "@/components/shared/WhatsAppButton";
import { BusinessHoursTable } from "@/components/site/sections/BusinessHoursTable";
import { SocialLinks } from "@/components/site/sections/SocialLinks";

/**
 * Contact details for a seller.
 *
 * In a B2B directory this block is the product. A buyer arrives, decides the
 * supplier is plausible, and wants to make contact within seconds — so phone,
 * WhatsApp and address are surfaced together, above anything decorative.
 *
 * Every field is conditional: sellers fill these in unevenly, and an empty
 * "Email:" label reads as a broken listing rather than an absent one.
 */

export function ContactPanel({
  seller,
  showHours = true,
}: {
  seller: SellerPublic;
  showHours?: boolean;
}) {
  const { address } = seller;

  const addressLines = [
    address.line1,
    address.line2,
    [address.city, address.state].filter(Boolean).join(", "),
    address.postalCode,
  ].filter((line): line is string => Boolean(line && line.trim()));

  return (
    <div className="grid gap-8 sm:grid-cols-2">
      <div className="space-y-5">
        <dl className="space-y-4 text-sm">
          {seller.phone ? (
            <Row label="Phone">
              {/* tel: links are the whole point on mobile, where most of this
                  market browses. */}
              <a href={`tel:${seller.phone}`} className="underline underline-offset-2">
                {seller.phone}
              </a>
            </Row>
          ) : null}

          {seller.email ? (
            <Row label="Email">
              <a href={`mailto:${seller.email}`} className="underline underline-offset-2">
                {seller.email}
              </a>
            </Row>
          ) : null}

          {addressLines.length > 0 ? (
            <Row label="Address">
              <address className="not-italic">
                {addressLines.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </address>
            </Row>
          ) : null}

          {seller.gstin ? (
            <Row label="GSTIN">
              <span className="font-mono text-xs tracking-wide">{seller.gstin}</span>
            </Row>
          ) : null}

          {seller.establishedYear ? <Row label="Established">{seller.establishedYear}</Row> : null}

          {seller.employeeCount ? <Row label="Employees">{seller.employeeCount}</Row> : null}
        </dl>

        {seller.whatsapp ? (
          <WhatsAppButton
            phone={seller.whatsapp}
            context={{ kind: "seller", sellerName: seller.businessName }}
          />
        ) : null}

        <SocialLinks links={seller.socialLinks} />
      </div>

      {showHours ? (
        <div>
          <BusinessHoursTable hours={seller.businessHours} timezone={seller.timezone} />
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <dt className="w-24 shrink-0 opacity-60">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
