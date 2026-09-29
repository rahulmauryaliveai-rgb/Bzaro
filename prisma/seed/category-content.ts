import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "../../src/generated/prisma/client";

/**
 * Starter intros and buyer FAQs for the main category pages (D44).
 *
 * Written for buyers, in plain Indian English, without price claims or
 * superlatives. FILLS EMPTY FIELDS ONLY: a category whose intro or FAQs an
 * admin has already written is left exactly as it is, so this is safe to
 * re-run. Edit the wording afterwards in Admin → Categories → "SEO & page".
 *
 * Run once on the server:  npm run db:seed:category-content
 */

type Content = { intro: string; faqs: Array<{ q: string; a: string }> };

export const CATEGORY_CONTENT: Record<string, Content> = {
  electronics: {
    intro:
      "Wires and cables, LED lighting, switches, switchgear, inverters and batteries for shops, offices, factories and housing projects.\n\nWhen you enquire, mention the **brand or ISI/BIS requirement**, the quantity and your delivery city. For cables, give the core count and size (for example 4 core, 2.5 sq mm) and the length; for lighting, the wattage, colour temperature and where it will be fitted. Suppliers quote faster when the specification is clear.",
    faqs: [
      {
        q: "What details should I share when asking for a cable or wire quote?",
        a: "The conductor (copper or aluminium), core count, size in sq mm, insulation type, length or number of coils, any brand you prefer, and the delivery city. If the job needs BIS-marked cable, say so up front.",
      },
      {
        q: "Can I buy small quantities for a single project?",
        a: "Many suppliers on Bzaro sell to contractors and small businesses as well as distributors. Each supplier sets their own minimum order — it is shown on the product page where they have added it, or you can ask in your enquiry.",
      },
      {
        q: "How do I compare LED lights from different suppliers?",
        a: "Compare like with like: wattage, lumen output, colour temperature (warm, neutral or cool white), IP rating for outdoor or damp areas, and the warranty period. Ask each supplier for the same details so the quotes line up.",
      },
    ],
  },
  "safety-security": {
    intro:
      "CCTV cameras and recorders, access control, fire safety equipment and personal protective gear for homes, shops, schools, offices and factories.\n\nFor CCTV, tell suppliers how many cameras you need, indoor or outdoor, the resolution, how many days of recording you want to keep, and whether installation is included. For safety gear, mention the standard your site follows and the sizes needed.",
    faqs: [
      {
        q: "IP camera or analogue (HD) camera — which should I ask for?",
        a: "IP cameras send video over a network and suit larger sites or remote viewing; HD analogue systems are often simpler for a few cameras over short cable runs. Describe your site and let two or three suppliers recommend — then compare the full package, not just the camera price.",
      },
      {
        q: "Do suppliers on Bzaro also install CCTV systems?",
        a: "Some supply equipment only and some also install and maintain. Say in your requirement whether you need installation, and in which city, so only suppliers who do that respond.",
      },
      {
        q: "What should a CCTV quote include?",
        a: "Camera model and count, recorder (DVR/NVR) with channel count, hard disk size, cabling, power supply, installation charges and warranty. A quote missing these is hard to compare.",
      },
    ],
  },
  "computers-it": {
    intro:
      "Laptops, desktops, networking equipment, printers, software and IT services for offices, schools and growing businesses.\n\nBulk and repeat orders are common here, so mention the quantity, the configuration you need (processor, RAM, storage), whether you need GST invoices, and any warranty or on-site service requirement.",
    faqs: [
      {
        q: "Can I get GST invoices for IT purchases?",
        a: "Registered suppliers can issue GST invoices. Mention your GSTIN in the enquiry if you want input tax credit, and confirm it with the supplier before ordering.",
      },
      {
        q: "Do suppliers handle annual maintenance (AMC)?",
        a: "Several IT service providers offer AMC for computers, networks and printers. Describe the number of devices and your location so they can quote accurately.",
      },
      {
        q: "Is refurbished equipment available?",
        a: "Some suppliers deal in refurbished laptops and desktops. Ask about the grade, the warranty offered and whether the machine comes with a licensed operating system.",
      },
    ],
  },
  "printing-signage": {
    intro:
      "Offset and digital printing, customised notebooks and stationery, flex and vinyl printing, sign boards, standees and display material for businesses, schools and events.\n\nPrinting is quoted per job, so share the size, paper or material, number of colours, quantity and your deadline. If you already have the design, say so; if not, ask whether the printer offers design support.",
    faqs: [
      {
        q: "What affects the price of a printing job?",
        a: "Quantity, paper or material, size, number of colours, finishing (lamination, binding, die-cutting) and turnaround time. Larger runs usually cost less per piece.",
      },
      {
        q: "Can I get a sample before a bulk print order?",
        a: "Many printers can share a digital proof and, for larger orders, a physical sample. Ask for it in your enquiry, especially for colour-critical work like packaging or brand material.",
      },
      {
        q: "How long does a typical print order take?",
        a: "It depends on the job and the printer's workload. Mention your deadline when you enquire so suppliers only respond if they can meet it.",
      },
    ],
  },
  "paper-stationery": {
    intro:
      "Copier paper, registers and notebooks, office stationery, files and school supplies, sold in bulk to offices, schools, coaching centres and retailers.\n\nFor paper, mention the size (A4, legal), GSM and number of reams; for notebooks and registers, the page count, ruling and whether you need custom printing on the cover.",
    faqs: [
      {
        q: "What does GSM mean when buying paper?",
        a: "GSM is the weight of the paper in grams per square metre. Everyday copier paper is usually around 70–75 GSM; higher GSM feels thicker and suits certificates or covers.",
      },
      {
        q: "Can schools order customised notebooks?",
        a: "Yes — several suppliers print the school name and logo on covers. Share the quantity, page count, ruling and the delivery date for the new session.",
      },
      {
        q: "Do stationery suppliers deliver to offices?",
        a: "Most local suppliers deliver within their city, and many handle monthly office supply orders. Mention your area and how often you need supplies.",
      },
    ],
  },
  packaging: {
    intro:
      "Corrugated boxes, cartons, pouches, labels, tapes and protective packaging for manufacturers, e-commerce sellers and exporters.\n\nFor boxes, share the inner dimensions, ply (3, 5 or 7), the weight of what goes inside, whether you need printing, and the monthly quantity. Packaging is usually made to order, so the clearer the specification, the more accurate the quote.",
    faqs: [
      {
        q: "3-ply, 5-ply or 7-ply boxes — which do I need?",
        a: "More plies make a stronger box. Light products shipped short distances often use 3-ply; heavier goods, stacking and long-distance transport usually need 5-ply or more. Tell the supplier the contents and weight and they will advise.",
      },
      {
        q: "Is there a minimum order for printed boxes?",
        a: "Printed and custom-size boxes usually have a minimum run set by the manufacturer. Ask for it in your enquiry along with the price for different quantities.",
      },
      {
        q: "Can I get samples before a bulk order?",
        a: "Many box makers supply a sample for approval before the full run. It is worth asking, especially for a new product or a new supplier.",
      },
    ],
  },
  "building-construction": {
    intro:
      "Cement, TMT bars, tiles, sanitaryware, pipes, paints, plywood and other building material, plus construction and interior services.\n\nFor material, mention the brand or grade, the quantity and the site location — delivery cost matters a lot for heavy items. For services, describe the work, the area in square feet and when you want it started.",
    faqs: [
      {
        q: "Does the quoted price include delivery to site?",
        a: "Not always. Ask each supplier whether the rate is ex-godown or delivered to your site, and whether unloading is included, so you compare the real cost.",
      },
      {
        q: "How do I check the grade of TMT bars or cement?",
        a: "Ask for the brand, grade (for example Fe 500D for TMT, OPC 53 or PPC for cement) and a test certificate for larger orders. BIS marking is shown on the product.",
      },
      {
        q: "Can I find contractors and interior designers here too?",
        a: "Yes — service businesses list under this category as well. Describe the job and your city when you post a requirement.",
      },
    ],
  },
  "industrial-supplies": {
    intro:
      "Tools, fasteners, bearings, welding supplies, lubricants, adhesives and other consumables that keep workshops and factories running.\n\nSpecify the size, grade or part number, the brand if it matters, and how often you reorder. Suppliers who can meet repeat monthly demand are often worth more than a one-time low price.",
    faqs: [
      {
        q: "Can I get the same part from a different brand?",
        a: "Often yes. Share the original part number and specifications; suppliers can suggest equivalents. Confirm critical dimensions and ratings before ordering.",
      },
      {
        q: "Do suppliers offer credit for regular orders?",
        a: "Terms are agreed directly with each supplier. Many work on advance for a first order and discuss credit once there is a buying history.",
      },
      {
        q: "How quickly can consumables be delivered?",
        a: "Local suppliers can often deliver stock items within a day or two in their city. Mention urgency in your requirement.",
      },
    ],
  },
  "apparel-garments": {
    intro:
      "Readymade garments, uniforms, corporate T-shirts and workwear from manufacturers, wholesalers and exporters.\n\nFor custom orders, mention the fabric, GSM, size breakup, colours, printing or embroidery, the quantity and the delivery date. For wholesale readymade stock, ask about minimum order per design and size set.",
    faqs: [
      {
        q: "What is the usual minimum order for custom T-shirts or uniforms?",
        a: "It varies by manufacturer and by how much customisation you need. Ask for the minimum per design and the price at two or three quantities.",
      },
      {
        q: "Can I see fabric samples first?",
        a: "Most manufacturers can share swatches or a sample garment before bulk production. It is the best way to avoid surprises on fabric and fit.",
      },
      {
        q: "Do suppliers handle school uniform orders?",
        a: "Several do, including stitching to size charts. Share the number of students, sizes and the session start date.",
      },
    ],
  },
  furniture: {
    intro:
      "Office furniture, school and institutional furniture, modular kitchens, wardrobes and home furniture — ready-made or made to measure.\n\nShare the item, dimensions or seating count, material (engineered wood, solid wood, steel), finish and delivery location. For made-to-measure work, ask whether a site visit and installation are included.",
    faqs: [
      {
        q: "Engineered wood or solid wood — what is the difference?",
        a: "Engineered wood (plywood, MDF, particle board) is stable and economical; solid wood is heavier and usually costs more. Ask the supplier which board and thickness they use and what the warranty covers.",
      },
      {
        q: "Do furniture makers offer installation?",
        a: "Many do for office and modular furniture. Mention your city and floor, and whether there is lift access.",
      },
      {
        q: "How long does custom furniture take?",
        a: "Lead time depends on the design and quantity. Share your required date so suppliers can confirm before quoting.",
      },
    ],
  },
  "solar-energy": {
    intro:
      "Solar panels, inverters, batteries, rooftop solar installation and other renewable energy equipment for homes, shops, schools and factories.\n\nFor rooftop solar, share your average monthly electricity bill or units used, the roof area available, on-grid or off-grid, and your city. Ask each installer what is included — panels, inverter, structure, wiring, net-metering paperwork and maintenance.",
    faqs: [
      {
        q: "How big a solar system do I need?",
        a: "It depends mainly on how many units you use and your roof space. Share a recent electricity bill with installers so they can size the system for you.",
      },
      {
        q: "On-grid or off-grid — which is right?",
        a: "On-grid systems feed power to the grid and suit places with regular supply; off-grid or hybrid systems use batteries for backup during cuts. Describe your power situation and let installers recommend.",
      },
      {
        q: "Do installers help with subsidy and net-metering paperwork?",
        a: "Many rooftop installers help with the application process. Ask whether it is included in their quote.",
      },
    ],
  },
  "books-media": {
    intro:
      "Books and study material, coaching and tuition, skill training and corporate training programmes.\n\nWhen you enquire, mention the class or course, subjects, preferred mode (at home, at centre or online), batch timing and your area. For bulk book orders, share the titles, quantity and delivery date.",
    faqs: [
      {
        q: "How do I choose a tutor or coaching centre?",
        a: "Ask about the teacher's experience with your board or exam, batch size, a trial class, and how progress is shared with parents.",
      },
      {
        q: "Can schools order books in bulk?",
        a: "Yes — distributors and publishers supply schools and institutions. Share the book list, quantities and when you need delivery.",
      },
      {
        q: "Are online classes available?",
        a: "Many tutors and training providers teach online as well as in person. Mention your preference in the requirement.",
      },
    ],
  },
};

async function main() {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  for (const file of [`.env.${nodeEnv}.local`, ".env.local", `.env.${nodeEnv}`, ".env"]) {
    loadEnv({ path: file, quiet: true });
  }
  const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");
  const pool = new Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    for (const [slug, content] of Object.entries(CATEGORY_CONTENT)) {
      const category = await prisma.category.findFirst({
        where: { slug, parentId: null },
        select: { id: true, name: true, description: true, faqs: true },
      });
      if (!category) {
        console.log(`– ${slug}: not found, skipped`);
        continue;
      }
      const data: { description?: string; faqs?: Content["faqs"] } = {};
      if (!category.description?.trim()) data.description = content.intro;
      if (!category.faqs) data.faqs = content.faqs;
      if (Object.keys(data).length === 0) {
        console.log(`= ${category.name}: already written, left as is`);
        continue;
      }
      await prisma.category.update({ where: { id: category.id }, data });
      console.log(`✓ ${category.name}: ${Object.keys(data).join(" + ")}`);
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
