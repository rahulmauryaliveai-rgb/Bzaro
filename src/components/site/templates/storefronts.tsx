import type { HomeProps } from "@/components/site/templates/registry";
import { makeStorefrontTemplate } from "@/components/site/storefront/template";
import { StorefrontHero } from "@/components/site/storefront/Hero";
import {
  CategoryRail,
  ContactStrip,
  EnquiryBand,
  FeaturedSplit,
  GalleryStrip,
  ProductRail,
  PromoTiles,
  ServicesRail,
  StorySplit,
  TrustBand,
  UspStrip,
} from "@/components/site/storefront/Sections";

/**
 * The six storefront templates (decision D33). Each is a composition of the
 * shared storefront sections with its own chrome variants; the look is
 * completed by the template's default theme tokens in prisma/seed/templates.ts
 * (colours, font pair, radius). Modelled on the reference themes the client
 * chose:
 *
 *   electro    Ochaka Electronic / XStore Electronic Mega Market
 *   medico     Ochaka Medical
 *   autoparts  Ochaka Car & Auto
 *   minimal    XStore Minimal Electronics / Ochaka Tech Accessories
 *   boutique   Ochaka Fashion / Ochaka Art
 *   fresh      XStore Grocery / Plants Store
 *
 * The home data is the same for all six — what differs is which sections
 * appear, in what order, and how the hero is cut.
 */

function ElectroHome({ context, data }: HomeProps) {
  const { seller } = context;
  return (
    <>
      <StorefrontHero context={context} data={data} variant="split" />
      <UspStrip seller={seller} variant="cards" />
      <CategoryRail categories={data.categories} variant="circles" title="Shop by category" />
      <ProductRail
        products={data.products}
        title="Deal of the day"
        eyebrow="Featured"
        columns={4}
        limit={4}
      />
      <PromoTiles products={data.products.slice(4)} gallery={data.gallery} count={3} />
      <ProductRail
        products={data.products.slice(4)}
        title="Best sellers"
        columns={4}
        limit={8}
        surface
      />
      <TrustBand seller={seller} counts={data.counts} variant="dark" />
      <ServicesRail services={data.services} />
      <StorySplit seller={seller} image={data.gallery[0]?.url ?? seller.coverImageUrl} />
      <EnquiryBand seller={seller} variant="brand" />
    </>
  );
}

function MedicoHome({ context, data }: HomeProps) {
  const { seller } = context;
  return (
    <>
      <StorefrontHero context={context} data={data} variant="sidebar" />
      <CategoryRail
        categories={data.categories}
        variant="circles"
        title="Shop by category"
        align="center"
      />
      <ProductRail products={data.products} title="Our best sellers" columns={5} limit={5} />
      <PromoTiles products={data.products.slice(5)} gallery={data.gallery} count={3} />
      <ProductRail
        products={data.products.slice(5)}
        title="More products"
        variant="row"
        limit={6}
      />
      <div className="bg-(--site-primary) py-2">
        <ProductRail
          products={data.products.slice(1)}
          title="Recommended for you"
          columns={4}
          limit={4}
          surface
        />
      </div>
      <UspStrip seller={seller} variant="line" />
      <StorySplit seller={seller} image={data.gallery[0]?.url ?? seller.coverImageUrl} reverse />
      <ServicesRail services={data.services} surface />
      <EnquiryBand seller={seller} variant="brand" />
    </>
  );
}

function AutopartsHome({ context, data }: HomeProps) {
  const { seller } = context;
  return (
    <>
      <StorefrontHero context={context} data={data} variant="sidebar" />
      <PromoTiles products={data.products} gallery={data.gallery} count={3} />
      <CategoryRail categories={data.categories} variant="circles" title="Shop by category" />
      <ProductRail products={data.products} title="Our best sellers" columns={4} limit={8} />
      <UspStrip seller={seller} variant="band" />
      <ProductRail
        products={data.products.slice(8)}
        title="Deal of the day"
        columns={4}
        limit={4}
        surface
      />
      <TrustBand seller={seller} counts={data.counts} variant="dark" />
      <GalleryStrip gallery={data.gallery} title="From the workshop" />
      <ServicesRail services={data.services} />
      <EnquiryBand seller={seller} variant="dark" />
    </>
  );
}

function MinimalHome({ context, data }: HomeProps) {
  const { seller } = context;
  return (
    <>
      <StorefrontHero context={context} data={data} variant="product" />
      <CategoryRail categories={data.categories} variant="cards" title="Browse the range" />
      <StorySplit seller={seller} image={data.gallery[0]?.url ?? seller.coverImageUrl} />
      <ProductRail
        products={data.products}
        title="Trending products"
        align="center"
        columns={4}
        limit={8}
      />
      <PromoTiles products={data.products.slice(8)} gallery={data.gallery} count={2} />
      <UspStrip seller={seller} variant="line" />
      <ServicesRail services={data.services} />
      <TrustBand seller={seller} counts={data.counts} variant="light" />
      <EnquiryBand seller={seller} variant="brand" />
    </>
  );
}

function BoutiqueHome({ context, data }: HomeProps) {
  const { seller } = context;
  return (
    <>
      <StorefrontHero context={context} data={data} variant="cover" />
      <CategoryRail
        categories={data.categories}
        variant="pills"
        title="Explore the collection"
        align="center"
      />
      <ProductRail
        products={data.products}
        title="Best sellers"
        align="center"
        columns={4}
        limit={8}
      />
      <PromoTiles products={data.products.slice(8)} gallery={data.gallery} count={2} />
      <StorySplit
        seller={seller}
        image={data.gallery[1]?.url ?? data.gallery[0]?.url ?? seller.coverImageUrl}
        reverse
      />
      <UspStrip seller={seller} variant="line" />
      <ServicesRail services={data.services} />
      <GalleryStrip gallery={data.gallery} title="Behind the scenes" />
      <EnquiryBand
        seller={seller}
        variant="image"
        image={seller.coverImageUrl ?? data.gallery[0]?.url}
      />
    </>
  );
}

function FreshHome({ context, data }: HomeProps) {
  const { seller } = context;
  return (
    <>
      <StorefrontHero context={context} data={data} variant="stats" />
      <UspStrip seller={seller} variant="cards" />
      <ProductRail
        products={data.products}
        title={`Hello from ${seller.businessName}`}
        eyebrow="Fresh picks"
        align="center"
        columns={4}
        limit={8}
      />
      <CategoryRail
        categories={data.categories}
        variant="cards"
        title="Trending categories"
        align="center"
      />
      <FeaturedSplit products={data.products} title="Deal of the month" />
      <GalleryStrip gallery={data.gallery} title="Straight from the source" variant="mosaic" />
      <StorySplit seller={seller} image={data.gallery[0]?.url ?? seller.coverImageUrl} />
      <ServicesRail services={data.services} surface />
      <ContactStrip seller={seller} />
      <EnquiryBand seller={seller} variant="brand" />
    </>
  );
}

export const ElectroTemplate = makeStorefrontTemplate({
  key: "electro",
  name: "Electro",
  header: "mega",
  footer: "dark",
  Home: ElectroHome,
});

export const MedicoTemplate = makeStorefrontTemplate({
  key: "medico",
  name: "Medico",
  header: "mega",
  footer: "light",
  Home: MedicoHome,
});

export const AutopartsTemplate = makeStorefrontTemplate({
  key: "autoparts",
  name: "Autoparts",
  header: "dark",
  footer: "dark",
  Home: AutopartsHome,
});

export const MinimalTemplate = makeStorefrontTemplate({
  key: "minimal",
  name: "Minimal",
  header: "clean",
  footer: "light",
  Home: MinimalHome,
});

export const BoutiqueTemplate = makeStorefrontTemplate({
  key: "boutique",
  name: "Boutique",
  header: "centered",
  footer: "dark",
  Home: BoutiqueHome,
});

export const FreshTemplate = makeStorefrontTemplate({
  key: "fresh",
  name: "Fresh",
  header: "fresh",
  footer: "brand",
  Home: FreshHome,
});
