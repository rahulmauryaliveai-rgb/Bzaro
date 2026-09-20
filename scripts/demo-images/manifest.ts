/**
 * What scripts/demo-images.ts fetches: one photo search per key. The key is
 * the image "seed" the seeds use (see CatalogEntry.resolveImage), so a file
 * `public/uploads/demo/<key>.webp` is picked up automatically.
 *
 *   product images   <product-slug>-<i>          count = fixture.images
 *   service image    service-<service-slug>
 *   gallery          <seller-slug>-gallery-<i>    count = galleryCount
 *   cover            <seller-slug>-cover
 *   category tile    category-<category-slug>     → public/uploads/categories/
 *
 * Queries are hand-tuned: stock-photo search engines match "turmeric" far
 * better than "Turmeric Powder, 3% Curcumin, 25 kg PP bags". Where a product
 * has no entry, its fixture's `imageQuery` or name is used.
 */

import { SHOWCASE } from "../../prisma/seed/data/showcase";
import { CATEGORY_TREE } from "../../prisma/seed/data/categories";

export type Want = {
  key: string;
  query: string;
  count: number;
  w: number;
  h: number;
  /** Sub-folder under public/uploads. */
  dir: "demo" | "categories";
  /** Files are `<key>-<i>.webp` (products, gallery) rather than `<key>.webp`. */
  indexed: boolean;
};

/** Product / service slug → photo query. */
const ITEM_QUERIES: Record<string, string> = {
  // ABC Electronics
  "led-panel-40w": "led panel light office ceiling",
  "led-bulb-9w-b22": "led light bulb",
  "street-light-120w": "led street light pole",
  "high-bay-150w": "led high bay light warehouse",
  "copper-cable-2-5mm": "copper electrical cable coil",
  "control-cable-4core": "electrical cable reel",
  "junction-box-6way": "electrical junction box",
  "service-lighting-design-consultation": "lighting design engineer plan",
  "service-installation-commissioning": "electrician installing light fixture",
  "service-amc-maintenance": "electrician maintenance panel",
  // Verma Plastics
  "ldpe-packaging-film": "plastic film roll factory",
  "moulded-closures": "plastic bottle caps",
  "shrink-sleeve": "shrink sleeve bottles",
  "service-custom-extrusion": "plastic extrusion machine",
  "service-contract-packaging": "packaging line factory workers",
  // Sharma Steel
  "tmt-bar-12mm-fe500d": "steel rebar bundle",
  "tmt-bar-16mm-fe500d": "rebar construction site",
  "ms-square-pipe-50x50": "square steel tubes stack",
  "gi-round-pipe-2-inch": "galvanized steel pipes",
  "service-cut-and-bend": "rebar bending worker",
  // MediCare
  "nitrile-gloves-powder-free": "nitrile gloves box",
  "3-ply-surgical-mask": "surgical face mask box",
  "digital-bp-monitor": "digital blood pressure monitor",
  "stainless-surgical-scissors-set": "surgical instruments tray",
  "hospital-bed-semi-fowler": "hospital bed ward",
  "service-hospital-consumables-supply": "medical supplies warehouse",
  // Kerala Spice Co
  "turmeric-powder-bulk": "turmeric powder",
  "black-pepper-whole-550gl": "black peppercorns",
  "red-chilli-powder-teja": "red chilli powder",
  "cardamom-green-8mm": "green cardamom pods",
  "cumin-seeds-europe-quality": "cumin seeds",
  "service-private-label-packing": "spice packaging factory",
  // Rathi Auto Parts
  "brake-pad-set-commercial": "brake pads",
  "led-headlamp-h4-truck": "led headlight bulb",
  "two-wheeler-clutch-plate": "motorcycle clutch plates",
  "engine-oil-15w40-ci4": "engine oil drum",
  "12v-100ah-truck-battery": "truck battery",
  "service-fleet-spares-supply": "truck fleet depot",
};

/** Seller slug → gallery and cover queries. */
const SELLER_QUERIES: Record<string, { gallery: string; cover: string }> = {
  "demo-abc-electronics": { gallery: "led factory assembly line", cover: "led lighting warehouse" },
  "demo-sharma-steel": { gallery: "steel stockyard rebar", cover: "steel warehouse" },
  "demo-medicare-supplies": { gallery: "medical supplies warehouse", cover: "hospital corridor" },
  "demo-kerala-spice-co": { gallery: "spice market india", cover: "spices bowls" },
  "demo-rathi-auto-parts": { gallery: "auto parts shop shelves", cover: "auto parts store" },
  "demo-verma-plastics": { gallery: "plastic factory machine", cover: "tarpaulin rolls" },
};

/** Root category slug → query (the homepage tiles). */
const CATEGORY_QUERIES: Record<string, string> = {
  electronics: "electronic components circuit",
  "building-construction": "construction site cement",
  textiles: "fabric rolls textile",
  "industrial-supplies": "industrial tools workshop",
  "industrial-machinery": "industrial machinery factory",
  "mechanical-parts": "gears bearings mechanical parts",
  "electrical-equipment": "electrical control panel",
  "apparel-garments": "garment factory sewing",
  "fashion-accessories": "leather shoes handbag",
  "gems-jewellery": "gold jewellery gemstones",
  "leather-products": "leather goods workshop",
  "food-beverages": "indian food ingredients",
  agriculture: "indian farmer field crop",
  chemicals: "chemical drums laboratory",
  "plastics-polymers": "plastic granules pellets",
  "rubber-products": "rubber tyres industrial",
  "metals-minerals": "steel coils metal",
  packaging: "cardboard boxes packaging",
  "paper-stationery": "office stationery paper",
  furniture: "office furniture chairs",
  "home-textiles": "bed linen towels",
  "kitchen-housewares": "stainless steel kitchen utensils",
  "handicrafts-decor": "indian handicrafts brass",
  "glass-ceramics": "ceramic tiles bathroom",
  "wood-timber": "timber planks lumber",
  pharmaceuticals: "pharmaceutical pills medicine",
  "medical-equipment": "hospital medical equipment",
  "herbal-ayurvedic": "ayurvedic herbs",
  "cosmetics-personal-care": "cosmetics bottles",
  "sports-toys": "sports equipment balls",
  automobile: "car parts garage",
  "computers-it": "computer server laptop",
  telecom: "mobile phones telecom",
  "lab-testing": "laboratory equipment glassware",
  "hvac-refrigeration": "air conditioner units",
  "solar-energy": "solar panels",
  "safety-security": "safety helmet cctv",
  "bags-luggage-industrial": "jute sacks bags",
  "books-media": "books stack education",
  "business-services": "business meeting office",
  "logistics-transport": "trucks logistics warehouse",
  "real-estate": "commercial building real estate",
  "events-hospitality": "catering event tables",
  "printing-signage": "printing press signage",
  "pet-animal": "cattle dairy farm",
  "baby-care": "baby products",
  "musical-instruments": "musical instruments",
  "marine-aviation": "shipping port cargo",
  "oil-gas-mining": "oil refinery",
  "environment-water": "water treatment plant",
  "tobacco-alcohol": "tobacco leaves",
};

/** Sub-category slug → query (storefront category strips of the demo sellers). */
const SUBCATEGORY_QUERIES: Record<string, string> = {
  "led-bulbs": "led bulbs",
  "led-panels": "led panel light",
  "street-lights": "street light",
  "industrial-lights": "industrial flood light",
  "copper-cables": "copper cable",
  "control-cables": "electrical cables",
  "switches-sockets": "electrical switch socket",
  "tmt-bars": "steel rebar",
  "steel-pipes": "steel pipes",
  "medical-disposables": "medical gloves masks",
  "diagnostic-equipment": "blood pressure monitor stethoscope",
  "hospital-equipment": "hospital bed",
  "surgical-instruments": "surgical instruments",
  "spices-masala": "indian spices",
  "dry-fruits": "dry fruits nuts",
  "truck-bus-parts": "truck engine parts",
  "auto-electricals": "car headlight",
  "two-wheeler-parts": "motorcycle parts",
  "auto-lubricants": "engine oil",
  "auto-batteries": "car battery",
  "industrial-textiles": "tarpaulin fabric roll",
  "packaging-bags": "plastic packaging bags",
  "plastic-products": "plastic products",
};

function findNode(slug: string, nodes = CATEGORY_TREE): { slug: string; name: string } | null {
  for (const node of nodes) {
    if (node.slug === slug) return node;
    const hit = node.children ? findNode(slug, node.children) : null;
    if (hit) return hit;
  }
  return null;
}

export function wants(): Want[] {
  const out: Want[] = [];

  for (const seller of SHOWCASE) {
    for (const p of seller.products) {
      const count = p.images ?? 0;
      if (count === 0) continue;
      out.push({
        key: p.slug,
        query: ITEM_QUERIES[p.slug] ?? p.imageQuery ?? p.name,
        count,
        w: 800,
        h: 600,
        dir: "demo",
        indexed: true,
      });
    }
    for (const s of seller.services) {
      out.push({
        key: `service-${s.slug}`,
        query: ITEM_QUERIES[`service-${s.slug}`] ?? s.imageQuery ?? s.name,
        count: 1,
        w: 800,
        h: 600,
        dir: "demo",
        indexed: false,
      });
    }
    const q = SELLER_QUERIES[seller.slug];
    if (q) {
      out.push({
        key: `${seller.slug}-gallery`,
        query: q.gallery,
        count: seller.galleryCount,
        w: 600,
        h: 600,
        dir: "demo",
        indexed: true,
      });
      out.push({
        key: `${seller.slug}-cover`,
        query: q.cover,
        count: 1,
        w: 1600,
        h: 600,
        dir: "demo",
        indexed: false,
      });
    }
  }

  const subSlugs = new Set<string>();
  for (const seller of SHOWCASE) {
    subSlugs.add(seller.categorySlug);
    for (const s of seller.secondaryCategorySlugs ?? []) subSlugs.add(s);
    for (const p of seller.products) subSlugs.add(p.categorySlug);
    for (const s of seller.services) subSlugs.add(s.categorySlug);
  }
  for (const slug of subSlugs) {
    const node = findNode(slug);
    if (!node) continue;
    out.push({
      key: `category-${slug}`,
      query: SUBCATEGORY_QUERIES[slug] ?? node.name,
      count: 1,
      w: 640,
      h: 480,
      dir: "categories",
      indexed: false,
    });
  }

  for (const root of CATEGORY_TREE) {
    out.push({
      key: `category-${root.slug}`,
      query: CATEGORY_QUERIES[root.slug] ?? root.name,
      count: 1,
      w: 640,
      h: 480,
      dir: "categories",
      indexed: false,
    });
  }

  return out;
}
