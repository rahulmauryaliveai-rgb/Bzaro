/**
 * Fixed lists for the seller profile: business types, size bands and
 * certifications. A module of constants with no imports, because both the
 * onboarding schemas and the profile schema need them and would otherwise
 * import each other.
 */

export const BUSINESS_TYPES = [
  "MANUFACTURER",
  "WHOLESALER",
  "DISTRIBUTOR",
  "TRADER",
  "RETAILER",
  "SERVICE_PROVIDER",
  "EXPORTER",
] as const;

export const BUSINESS_TYPE_LABELS: Record<(typeof BUSINESS_TYPES)[number], string> = {
  MANUFACTURER: "Manufacturer",
  WHOLESALER: "Wholesaler",
  DISTRIBUTOR: "Distributor",
  TRADER: "Trader",
  RETAILER: "Retailer",
  SERVICE_PROVIDER: "Service provider",
  EXPORTER: "Exporter",
};

export const MAX_SECONDARY_CATEGORIES = 4;
export const MAX_SERVICE_AREAS = 20;

export const EMPLOYEE_BANDS = ["1-10", "11-50", "51-200", "201-500", "500+"] as const;

export const TURNOVER_BANDS = [
  "Under 40 Lakh",
  "40 Lakh - 1.5 Cr",
  "1.5 Cr - 5 Cr",
  "5 Cr - 25 Cr",
  "25 Cr - 100 Cr",
  "100 Cr+",
] as const;

export const CERTIFICATIONS = [
  "ISO 9001",
  "ISO 14001",
  "MSME / Udyam",
  "BIS",
  "GMP",
  "CE",
  "FSSAI",
  "IEC (Import Export Code)",
  "Startup India",
] as const;
