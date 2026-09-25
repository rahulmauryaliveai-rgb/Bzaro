import type { Metadata } from "next";
import { getAllCities, getRootCategories } from "@/server/services/taxonomy.service";
import { ContactIntentSteps, type RequirementPrefill } from "@/components/buyer/ContactIntentModal";
import { db } from "@/lib/db";
import { getBuyerSession } from "@/server/services/buyer.service";
import { CONSENT_TEXT } from "@/lib/consent";
import { marketplaceUrl } from "@/lib/utils/url";

/**
 * Post a requirement without picking a supplier (docs/LEADS.md §2).
 *
 * The same requirement → sign-in steps as the contact modal, rendered inline.
 * With no seller there is no DIRECT lead: the requirement goes only to the
 * market fan-out, so the buyer chooses the category themselves.
 */

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Post a requirement — get quotes from verified suppliers",
  description:
    "Tell us what you need once. Up to 10 verified suppliers in your category and city receive your requirement and contact you with their best price.",
  alternates: { canonical: marketplaceUrl("/post-requirement") },
};

type Props = { searchParams: Promise<{ repost?: string; q?: string; resume?: string }> };

export default async function PostRequirementPage({ searchParams }: Props) {
  const { repost, q, resume } = await searchParams;
  const [cities, categories] = await Promise.all([getAllCities(), getRootCategories()]);

  /**
   * "Re-post" carries a previous requirement forward. Scoped to the signed-in
   * buyer's own rows — an id from someone else's requirement must not reveal
   * what they were sourcing.
   *
   * Consent is deliberately NOT carried over: it is given afresh on each
   * submission, which is the whole point of versioning it.
   */
  let prefill: RequirementPrefill | undefined;
  if (repost) {
    const buyer = await getBuyerSession();
    if (buyer) {
      const previous = await db.requirement.findFirst({
        where: { id: repost, buyerId: buyer.id },
        select: {
          productName: true,
          quantity: true,
          quantityUnit: true,
          categoryId: true,
          locationId: true,
          timeline: true,
          purpose: true,
          notes: true,
        },
      });
      if (previous) {
        prefill = {
          productName: previous.productName,
          quantity: previous.quantity,
          quantityUnit: previous.quantityUnit,
          categoryId: previous.categoryId,
          locationId: previous.locationId,
          timeline: previous.timeline,
          purpose: previous.purpose,
          notes: previous.notes ?? undefined,
        };
      }
    }
  }

  // A search that found nothing hands its query over as a starting point.
  if (!prefill && q) prefill = { productName: q };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="grid gap-10 lg:grid-cols-[1fr_minmax(0,28rem)]">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-balance">
            Tell us what you need. Suppliers come to you.
          </h1>
          <ol className="mt-6 space-y-4 text-sm text-neutral-700">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-medium text-white">
                1
              </span>
              <span>Describe the product, quantity, city and when you need it.</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-medium text-white">
                2
              </span>
              <span>Create an account and confirm your email with a one-time code.</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-medium text-white">
                3
              </span>
              <span>
                Up to 10 verified suppliers matched to your category and city receive it and contact
                you with quotes.
              </span>
            </li>
          </ol>
          <p className="mt-6 text-xs text-neutral-500">{CONSENT_TEXT}</p>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold">Post your requirement</h2>
          <ContactIntentSteps
            target={{ sellerHasWhatsApp: false }}
            cities={cities.map((c) => ({ id: c.id, name: c.name }))}
            categories={categories.map((c) => ({ id: c.id, name: c.name }))}
            prefill={prefill}
            resume={resume === "1"}
          />
        </div>
      </div>
    </div>
  );
}
