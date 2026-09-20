import type { Metadata } from "next";
import { requireSeller } from "@/lib/auth/guards";
import { finishOnboardingAction } from "@/server/actions/onboarding";
import { Stepper } from "@/components/onboarding/Stepper";

export const metadata: Metadata = {
  title: "Add your catalogue",
  robots: { index: false, follow: false },
};

/**
 * Onboarding step 4 of 4. Two exits, both of which mark onboarding complete:
 * add a first product now, or go to the dashboard and do it later. A seller
 * with no products is invisible in discovery, and the dashboard's completion
 * bar says so.
 */
export default async function RegisterCatalogPage() {
  await requireSeller();

  return (
    <div className="w-full max-w-xl rounded-lg border border-neutral-200 bg-white p-6">
      <Stepper current="CATALOG" />
      <h1 className="mb-1 text-lg font-semibold tracking-tight">Add your first product</h1>
      <p className="mb-6 text-sm text-neutral-600">
        Buyers find you through products. A listing with even one product appears in category pages,
        city pages and search; one without does not.
      </p>

      <form action={finishOnboardingAction} className="space-y-3">
        <button
          type="submit"
          name="next"
          value="product"
          className="w-full rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Add a product now
        </button>
        <button
          type="submit"
          name="next"
          value="dashboard"
          className="w-full rounded-md border border-neutral-300 px-4 py-2.5 text-sm font-medium hover:bg-neutral-50"
        >
          Go to my dashboard
        </button>
      </form>

      <p className="mt-6 text-xs text-neutral-500">
        Your website is live at your address once we verify your business — usually within a working
        day.
      </p>
    </div>
  );
}
