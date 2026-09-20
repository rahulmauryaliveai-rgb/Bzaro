import type { Metadata } from "next";
import { requireSeller } from "@/lib/auth/guards";
import { getSellerProfile, listActiveTemplates } from "@/server/services/seller.service";
import { saveThemeStepAction } from "@/server/actions/onboarding";
import { Stepper } from "@/components/onboarding/Stepper";
import { TemplatePicker } from "@/components/site/TemplatePicker";

export const metadata: Metadata = {
  title: "Choose your website look",
  robots: { index: false, follow: false },
};

/**
 * Onboarding step 4 of 5 (decision D33): pick a website template. Every card
 * applies the template and moves on; "Keep the default" moves on without
 * changing anything. The choice is never final — the dashboard's Website
 * page offers the same picker.
 */
export default async function RegisterThemePage() {
  const scope = await requireSeller();
  const [templates, profile] = await Promise.all([
    listActiveTemplates(),
    getSellerProfile(scope.sellerId),
  ]);

  return (
    <div className="w-full max-w-4xl rounded-lg border border-neutral-200 bg-white p-6">
      <Stepper current="THEME" />
      <h1 className="mb-1 text-lg font-semibold tracking-tight">Choose your website look</h1>
      <p className="mb-6 text-sm text-neutral-600">
        Your products, photos and contact details are laid out by the template you pick. You can
        switch templates and change colours any time from your dashboard.
        {scope.webPresence === "CATALOGUE"
          ? " Your website goes live at your own web address on the Gold plan."
          : ""}
      </p>

      <TemplatePicker
        templates={templates}
        currentKey={profile?.website?.template.key ?? null}
        action={saveThemeStepAction}
        columns={3}
        ctaLabel="Use this look & continue"
      />

      <form action={saveThemeStepAction} className="mt-6">
        <button
          type="submit"
          className="w-full rounded-md border border-neutral-300 px-4 py-2.5 text-sm font-medium hover:bg-neutral-50"
        >
          Keep the default and continue
        </button>
      </form>
    </div>
  );
}
