import type { ComponentType } from "react";
import type { TenantContext } from "@/lib/tenant/context";
import type {
  GalleryEntry,
  ProductCard,
  ProductDetail,
  ServiceCard,
  ServiceDetail,
} from "@/server/services/site-content.service";
import { ClassicTemplate } from "@/components/site/templates/classic";
import { ModernTemplate } from "@/components/site/templates/modern";

/**
 * Website template registry (decision D7).
 *
 * Templates are CODE, not data. A `WebsiteTemplate` row stores a `key`; that
 * key selects a React component from this map. Sellers choose a template and
 * tune validated design tokens — they never supply markup, CSS, or anything
 * else that gets executed.
 *
 * The alternative, user-authored HTML, needs sanitisation, sandboxing, a
 * rendering engine and template versioning. That is a product in itself, and it
 * turns every seller into a potential XSS vector against their own customers.
 *
 * ── The contract that makes template switching free ──────────────────────────
 * Every template implements the SAME page set with the SAME props. A seller
 * switching template changes one column; no content moves, nothing is lost, and
 * no migration runs. That property only holds because the data a page receives
 * is fixed by this interface rather than by each template's appetite.
 *
 * Templates are also pure: they receive props and render. They never query, so
 * they are previewable in the dashboard and testable in isolation.
 *
 * Adding a template:
 *   1. Build it under components/site/templates/<key>/
 *   2. Register it below
 *   3. Insert the matching WebsiteTemplate row (prisma/seed/templates.ts)
 */

export type TemplateProps = { context: TenantContext };

export type HomeProps = TemplateProps & {
  data: {
    products: ProductCard[];
    services: ServiceCard[];
    gallery: Array<Pick<GalleryEntry, "id" | "url" | "alt" | "title" | "blurDataUrl">>;
  };
};

export type AboutProps = TemplateProps & {
  data: { counts: { products: number; services: number; gallery: number } };
};

export type ProductsProps = TemplateProps & {
  data: { items: ProductCard[]; total: number; page: number; pageCount: number };
};

export type ProductDetailProps = TemplateProps & {
  data: { product: ProductDetail; related: ProductCard[] };
};

export type ServicesProps = TemplateProps & {
  data: { items: ServiceCard[]; total: number };
};

export type ServiceDetailProps = TemplateProps & {
  data: { service: ServiceDetail };
};

export type GalleryProps = TemplateProps & {
  data: { items: GalleryEntry[] };
};

export type ContactProps = TemplateProps;

/** Every page a seller website provides. */
export type SiteTemplate = {
  key: string;
  name: string;
  Home: ComponentType<HomeProps>;
  About: ComponentType<AboutProps>;
  Products: ComponentType<ProductsProps>;
  ProductDetail: ComponentType<ProductDetailProps>;
  Services: ComponentType<ServicesProps>;
  ServiceDetail: ComponentType<ServiceDetailProps>;
  Gallery: ComponentType<GalleryProps>;
  Contact: ComponentType<ContactProps>;
};

const TEMPLATES: Record<string, SiteTemplate> = {
  classic: ClassicTemplate,
  modern: ModernTemplate,
};

export const DEFAULT_TEMPLATE_KEY = "classic";

/**
 * Resolve a template by key.
 *
 * Falls back to the default rather than throwing. A seller whose template row
 * was retired, or whose plan no longer includes a premium template, must still
 * get a working site — their content is intact, only the presentation changes.
 * Throwing here would take a paying seller's website offline over a billing
 * state change.
 */
export function getTemplate(key: string | null | undefined): SiteTemplate {
  return (key ? TEMPLATES[key] : undefined) ?? TEMPLATES[DEFAULT_TEMPLATE_KEY]!;
}

/** All registered templates, for the dashboard picker. */
export function listTemplates(): SiteTemplate[] {
  return Object.values(TEMPLATES);
}

/** True when `key` maps to a real template — validates settings writes. */
export function isKnownTemplate(key: string): boolean {
  return key in TEMPLATES;
}
