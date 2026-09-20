import { getAllCities } from "@/server/services/taxonomy.service";
import { isValidWhatsAppNumber } from "@/lib/whatsapp/link";
import { ContactButtons } from "./ContactButtons";

/**
 * Server wrapper for the contact buttons: resolves the city list (cached,
 * tagged on the location tree) and decides whether WhatsApp is offered.
 *
 * Mount this wherever a page used to render <WhatsAppButton>. The seller's
 * number never reaches the client here — the wa.me link is built server-side
 * after the requirement exists.
 */
export async function ContactIntent({
  seller,
  product,
  className,
  show,
  whatsappClassName,
  priceClassName,
  priceLabel,
}: {
  seller: {
    id: string;
    businessName: string;
    whatsapp: string | null;
    /** Primary category id, for seller-level contact. */
    primaryCategoryId?: string | null;
  };
  product?: { id: string; name: string } | null;
  className?: string;
  show?: "both" | "whatsapp" | "price";
  whatsappClassName?: string;
  priceClassName?: string;
  priceLabel?: string;
}) {
  const cities = await getAllCities();

  return (
    <ContactButtons
      className={className}
      show={show}
      whatsappClassName={whatsappClassName}
      priceClassName={priceClassName}
      priceLabel={priceLabel}
      cities={cities}
      target={{
        sellerId: seller.id,
        sellerName: seller.businessName,
        productId: product?.id,
        productName: product?.name,
        categoryId: seller.primaryCategoryId ?? undefined,
        sellerHasWhatsApp: isValidWhatsAppNumber(seller.whatsapp),
      }}
    />
  );
}
