import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSeller } from "@/lib/auth/guards";
import { getSellerProfile, getSlugChangeStatus } from "@/server/services/seller.service";
import { publishWebsiteAction } from "@/server/actions/seller";
import { listTemplates } from "@/components/site/templates/registry";
import { themeTokensSchema, defaultThemeTokens } from "@/lib/validation/theme";
import { WebsiteSettingsForm } from "@/components/dashboard/WebsiteSettingsForm";
import { tenantUrl } from "@/lib/utils/url";

export const metadata: Metadata = {
  title: "Website settings",
  robots: { index: false, follow: false },
};

export default async function WebsiteSettingsPage() {
  const scope = await requireSeller();

  const [profile, slugStatus] = await Promise.all([
    getSellerProfile(scope.sellerId),
    // The 90-day cooldown is computed in the service: reading the clock in a
    // render body is an impure call, and the rule (D11) belongs in one place.
    getSlugChangeStatus(scope.sellerId),
  ]);

  if (!profile) notFound();

  // Stored tokens are parsed, never trusted: the column is JSON, and a row
  // written by an older schema version must degrade to defaults rather than
  // throwing inside the settings page the seller needs to fix it with.
  const parsed = themeTokensSchema.safeParse(profile.website?.themeTokens);
  const tokens = parsed.success ? parsed.data : defaultThemeTokens;

  const published = profile.website?.publishedAt != null;

  // Publishing and being indexable are NOT the same thing. Publishing is one
  // of several D2 conditions; the rest live on the overview checklist. Saying
  // "eligible for search indexing" purely because a site is published
  // contradicts the checklist telling the same seller they are hidden — and
  // the seller believes whichever they read last.
  const indexable = profile.website?.indexable === true;

  return (
    <div className="max-w-2xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Website</h1>
        <p className="mt-1 text-sm text-neutral-600">
          <a
            href={tenantUrl(scope.sellerSlug)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-teal-700 underline underline-offset-2"
          >
            View your site ↗
          </a>
        </p>
      </header>

      {/*
        Publishing is its own control, not a checkbox inside the settings form.
        It is a gate condition for indexing (D2), and it changes what the public
        sees — so it should never be toggled as a side effect of changing a
        colour.
      */}
      <section className="mb-8 rounded-lg border border-neutral-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-medium">{published ? "Published" : "Not published"}</h2>
            <p className="mt-0.5 text-sm text-neutral-600">
              {!published ? (
                "Your site is reachable, but held back from search engines until you publish."
              ) : indexable ? (
                "Your site is live and eligible for search indexing."
              ) : (
                <>
                  Your site is live, but not yet eligible for search indexing.{" "}
                  <Link
                    href="/dashboard"
                    className="text-teal-700 underline underline-offset-2"
                  >
                    See what is missing
                  </Link>
                  .
                </>
              )}
            </p>
          </div>

          <form action={publishWebsiteAction}>
            <input type="hidden" name="publish" value={published ? "0" : "1"} />
            <button
              type="submit"
              className={`rounded-md px-4 py-2 text-sm font-medium ${
                published
                  ? "border border-neutral-300 hover:bg-neutral-50"
                  : "bg-teal-700 text-white hover:bg-teal-600"
              }`}
            >
              {published ? "Unpublish" : "Publish site"}
            </button>
          </form>
        </div>
      </section>

      <WebsiteSettingsForm
        templateKey={profile.website?.template.key ?? "classic"}
        templates={listTemplates().map((template) => ({
          key: template.key,
          name: template.name,
        }))}
        tokens={tokens}
        metaTitle={profile.website?.metaTitle ?? null}
        metaDescription={profile.website?.metaDescription ?? null}
        slug={profile.slug}
        canChangeSlug={slugStatus.canChange}
        slugCooldownMessage={
          slugStatus.remainingDays
            ? `You can change your web address again in ${slugStatus.remainingDays} day${slugStatus.remainingDays === 1 ? "" : "s"}.`
            : null
        }
      />
    </div>
  );
}
