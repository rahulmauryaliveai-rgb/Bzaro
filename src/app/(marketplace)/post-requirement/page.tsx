import type { Metadata } from "next";
import { getAllCities, getRootCategories } from "@/server/services/taxonomy.service";
import { ContactIntentSteps } from "@/components/buyer/ContactIntentModal";
import { BUYER_CONSENT_TEXT } from "@/lib/validation/otp";
import { marketplaceUrl } from "@/lib/utils/url";

/**
 * Post a requirement without picking a supplier (docs/LEADS.md §2).
 *
 * The same phone → OTP → requirement steps as the contact modal, rendered
 * inline. With no seller there is no DIRECT lead: the requirement goes only
 * to the market fan-out, so the buyer chooses the category themselves.
 */

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Post a requirement — get quotes from verified suppliers",
  description:
    "Tell us what you need once. Up to 10 verified suppliers in your category and city receive your requirement and contact you with their best price.",
  alternates: { canonical: marketplaceUrl("/post-requirement") },
};

export default async function PostRequirementPage() {
  const [cities, categories] = await Promise.all([getAllCities(), getRootCategories()]);

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
              <span>Verify your mobile number with a one-time code.</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-medium text-white">
                2
              </span>
              <span>Describe the product, quantity, city and when you need it.</span>
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
          <p className="mt-6 text-xs text-neutral-500">{BUYER_CONSENT_TEXT}</p>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold">Post your requirement</h2>
          <ContactIntentSteps
            target={{ sellerHasWhatsApp: false }}
            cities={cities.map((c) => ({ id: c.id, name: c.name }))}
            categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          />
        </div>
      </div>
    </div>
  );
}
