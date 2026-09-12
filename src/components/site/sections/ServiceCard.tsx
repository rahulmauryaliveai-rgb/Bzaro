import Link from "next/link";
import { formatMoney } from "@/lib/utils/money";
import type { ServiceCard as ServiceCardData } from "@/server/services/site-content.service";

/**
 * Service card.
 *
 * Services price differently from products — hourly, fixed, or quote-only — so
 * the pricing model is shown alongside the number. "₹5,000" means something
 * very different per hour than per project, and omitting which is a common way
 * for directories to generate angry phone calls.
 */

const PRICING_LABELS: Record<string, string> = {
  hourly: "per hour",
  fixed: "fixed price",
  quote: "on quotation",
  daily: "per day",
  monthly: "per month",
};

export function ServiceCard({ service }: { service: ServiceCardData }) {
  const price =
    service.priceOnRequest || service.priceMinor === null
      ? "Price on request"
      : `${formatMoney(service.priceMinor, service.currency)}${
          service.pricingModel ? ` ${PRICING_LABELS[service.pricingModel] ?? ""}` : ""
        }`.trim();

  return (
    <Link
      href={`/services/${service.slug}`}
      className="flex flex-col rounded-lg border p-5 transition-shadow hover:shadow-md"
      style={{ borderColor: "var(--site-border)", background: "var(--site-surface)" }}
    >
      {service.category ? (
        <p className="text-xs tracking-wide uppercase opacity-60">{service.category.name}</p>
      ) : null}

      <h3 className="mt-1 leading-snug font-medium text-balance">{service.name}</h3>

      {service.shortDescription ? (
        <p className="mt-2 line-clamp-3 text-sm opacity-70">{service.shortDescription}</p>
      ) : null}

      {service.serviceAreas.length > 0 ? (
        <p className="mt-3 text-xs opacity-60">
          Serves {service.serviceAreas.slice(0, 3).join(", ")}
          {service.serviceAreas.length > 3 ? ` +${service.serviceAreas.length - 3} more` : ""}
        </p>
      ) : null}

      <p className="mt-auto pt-4 text-sm font-semibold">{price}</p>
    </Link>
  );
}
