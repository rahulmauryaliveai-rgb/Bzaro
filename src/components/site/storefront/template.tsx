import type { ComponentType } from "react";
import type { HomeProps, SiteTemplate } from "@/components/site/templates/registry";
import type { HeaderVariant } from "@/components/site/storefront/Header";
import type { FooterVariant } from "@/components/site/storefront/Footer";
import { StorefrontShell } from "@/components/site/storefront/Shell";
import {
  AboutBody,
  ContactBody,
  GalleryBody,
  ProductsBody,
  ServiceDetailBody,
  ServicesBody,
} from "@/components/site/pages/bodies";
import { ProductDetailBody } from "@/components/site/pages/ProductDetailBody";

/**
 * Assemble a storefront template from its home composition and chrome
 * variants. Inner pages share the page bodies with Classic and Modern, which
 * is what keeps "switching template loses nothing" true for every template
 * (registry contract).
 */
export function makeStorefrontTemplate({
  key,
  name,
  header,
  footer,
  Home,
}: {
  key: string;
  name: string;
  header: HeaderVariant;
  footer: FooterVariant;
  Home: ComponentType<HomeProps>;
}): SiteTemplate {
  const shell = (width: "wide" | "narrow" = "wide") =>
    function Page({
      context,
      children,
    }: {
      context: HomeProps["context"];
      children: React.ReactNode;
    }) {
      return (
        <StorefrontShell context={context} header={header} footer={footer} width={width}>
          {children}
        </StorefrontShell>
      );
    };
  const Wide = shell("wide");
  const Narrow = shell("narrow");

  return {
    key,
    name,
    Home: (props) => (
      <StorefrontShell context={props.context} header={header} footer={footer} flush>
        <Home {...props} />
      </StorefrontShell>
    ),
    About: (props) => (
      <Narrow context={props.context}>
        <AboutBody {...props} />
      </Narrow>
    ),
    Products: (props) => (
      <Wide context={props.context}>
        <ProductsBody {...props} />
      </Wide>
    ),
    ProductDetail: (props) => (
      <Wide context={props.context}>
        <ProductDetailBody {...props} />
      </Wide>
    ),
    Services: (props) => (
      <Wide context={props.context}>
        <ServicesBody {...props} />
      </Wide>
    ),
    ServiceDetail: (props) => (
      <Narrow context={props.context}>
        <ServiceDetailBody {...props} />
      </Narrow>
    ),
    Gallery: (props) => (
      <Wide context={props.context}>
        <GalleryBody {...props} />
      </Wide>
    ),
    Contact: (props) => (
      <Narrow context={props.context}>
        <ContactBody {...props} />
      </Narrow>
    ),
  };
}
