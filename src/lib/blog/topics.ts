/**
 * The blog autopilot's topic list (D47), in the order it works through them.
 * Each topic is written once; add new ones at the end (or anywhere — only
 * the `key` must never change once used). Category slugs must exist.
 *
 * When every topic is used, the autopilot picks a category with no guide yet
 * and asks for a practical guide on something buyers in it commonly order.
 */
export type BlogTopic = { key: string; title: string; categories: string[] };

export const BLOG_TOPICS: BlogTopic[] = [
  {
    key: "led-panels-office",
    title: "How to choose LED panel lights for an office",
    categories: ["electronics", "lighting"],
  },
  {
    key: "copper-vs-aluminium-wires",
    title: "Copper vs aluminium wires for a shop or factory: what to specify",
    categories: ["electronics", "cables-wires"],
  },
  {
    key: "school-notebooks-bulk",
    title: "Buying school notebooks and registers in bulk: GSM, ruling and printing",
    categories: ["paper-stationery"],
  },
  {
    key: "choosing-a-printer",
    title: "Choosing an offset or digital printer for brochures and catalogues",
    categories: ["printing-signage"],
  },
  {
    key: "office-furniture-checklist",
    title: "Office furniture for a new office: a buying checklist",
    categories: ["furniture"],
  },
  {
    key: "bulk-laptops",
    title: "Buying laptops in bulk for a small business",
    categories: ["computers-it"],
  },
  {
    key: "small-office-networking",
    title: "Networking for a small office: routers, switches and cabling",
    categories: ["computers-it"],
  },
  {
    key: "corporate-tshirts-uniforms",
    title: "Corporate T-shirts and uniforms: fabric, GSM and minimum orders",
    categories: ["apparel-garments"],
  },
  {
    key: "compare-supplier-quotes",
    title: "How to compare quotes from suppliers and spot what is missing",
    categories: ["business-services"],
  },
  {
    key: "write-a-good-requirement",
    title: "How to write a requirement suppliers can actually quote on",
    categories: ["business-services"],
  },
  {
    key: "fire-extinguishers",
    title: "Fire extinguishers for shops and offices: types, sizes and refills",
    categories: ["safety-security"],
  },
  {
    key: "access-control-attendance",
    title: "Access control and biometric attendance systems: what to ask",
    categories: ["safety-security"],
  },
  {
    key: "inverter-battery-sizing",
    title: "Inverters and batteries for shops: sizing for power cuts",
    categories: ["electronics", "inverters-ups"],
  },
  {
    key: "tmt-cement-small-job",
    title: "Buying TMT bars and cement for a small construction job",
    categories: ["building-construction"],
  },
  {
    key: "tiles-sanitaryware",
    title: "Tiles and sanitaryware for a commercial project: what to check",
    categories: ["glass-ceramics", "building-construction"],
  },
  {
    key: "ecommerce-packing-supplies",
    title: "Tapes, stretch film and void fill for e-commerce sellers",
    categories: ["packaging"],
  },
  {
    key: "food-pouches-labels",
    title: "Printed pouches and labels for food products",
    categories: ["packaging"],
  },
  {
    key: "choose-coaching-tutor",
    title: "Choosing a coaching centre or home tutor: questions parents should ask",
    categories: ["books-media"],
  },
  {
    key: "industrial-fasteners",
    title: "Industrial fasteners: grades, sizes and ordering in bulk",
    categories: ["industrial-supplies"],
  },
  {
    key: "welding-workshop",
    title: "Welding machines and consumables for a small workshop",
    categories: ["industrial-supplies"],
  },
  {
    key: "corporate-event-caterer",
    title: "Hiring a caterer for a corporate event",
    categories: ["events-hospitality"],
  },
  {
    key: "part-load-transport",
    title: "Choosing a transporter for part-load shipments within India",
    categories: ["logistics-transport"],
  },
  {
    key: "factory-ppe",
    title: "Buying safety shoes, gloves and helmets for a factory",
    categories: ["safety-security"],
  },
  {
    key: "ro-plants-offices",
    title: "Water purifiers and RO plants for offices and schools",
    categories: ["environment-water"],
  },
  {
    key: "commercial-ac",
    title: "Air conditioners for shops and offices: tonnage and star ratings",
    categories: ["hvac-refrigeration"],
  },
  {
    key: "shop-signage",
    title: "Sign boards and LED signage for a shop front",
    categories: ["printing-signage"],
  },
  {
    key: "modular-kitchen",
    title: "Modular kitchen: what to ask before you sign",
    categories: ["furniture"],
  },
  {
    key: "clinic-setup",
    title: "Hospital furniture and basic medical equipment for a new clinic",
    categories: ["medical-equipment"],
  },
  {
    key: "bulk-spices-grains",
    title: "Buying spices and grains in bulk for a restaurant or retail store",
    categories: ["food-beverages"],
  },
  {
    key: "gst-invoice-checks",
    title: "GST invoices when buying from suppliers: what to check",
    categories: ["business-services"],
  },
];
