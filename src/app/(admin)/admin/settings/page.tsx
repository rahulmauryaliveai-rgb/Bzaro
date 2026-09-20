import { requirePermission } from "@/lib/auth/guards";
import { getIndexEligibilityRules } from "@/server/services/indexability.service";
import { updateIndexEligibilityAction } from "@/server/actions/admin";
import { updateBillingSettingsAction } from "@/server/actions/billing";
import { getSetting } from "@/lib/settings";
import {
  BILLING_SETTINGS_KEY,
  DEFAULT_BILLING_SETTINGS,
  billingSettingsSchema,
} from "@/lib/validation/billing-settings";

/**
 * Platform settings — currently the index-eligibility rules (decision D2).
 *
 * This screen is the whole point of storing those thresholds as data. When
 * Search Console starts reporting thin content, the bar goes up the same
 * afternoon; when the bar turns out to be gatekeeping legitimate small sellers,
 * it comes down just as fast. Neither should need a deploy.
 *
 * Changes apply to NEW evaluations immediately. Existing sellers are re-scored
 * by the nightly recompute job rather than synchronously — re-evaluating every
 * seller here would block the request and invalidate thousands of caches at
 * once.
 */
export default async function AdminSettingsPage() {
  await requirePermission("admin:settings:manage");
  const [rules, billing] = await Promise.all([
    getIndexEligibilityRules(),
    getSetting(BILLING_SETTINGS_KEY, billingSettingsSchema, DEFAULT_BILLING_SETTINGS),
  ]);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Index eligibility decides when a seller&rsquo;s website becomes visible to search engines.
      </p>

      <div className="mt-6 rounded-lg border border-amber-800 bg-amber-950/30 p-4 text-sm text-amber-200">
        Raising these thresholds makes fewer seller sites indexable. That is the intended defence
        against a thin-content penalty on the root domain — but it also delays legitimate sellers,
        so change them with a reason.
      </div>

      <form action={updateIndexEligibilityAction} className="mt-8 space-y-8">
        <fieldset className="rounded-lg border border-neutral-700 bg-neutral-800 p-5">
          <legend className="px-2 text-sm font-semibold tracking-wide text-neutral-400 uppercase">
            Required conditions
          </legend>

          <div className="space-y-3">
            <Toggle
              name="requireVerifiedSeller"
              label="Seller must be verified"
              defaultChecked={rules.requireVerifiedSeller}
            />
            <Toggle
              name="requireVerifiedPhone"
              label="Phone number must be verified"
              defaultChecked={rules.requireVerifiedPhone}
            />
            <Toggle
              name="requireActiveStatus"
              label="Must not be suspended"
              defaultChecked={rules.requireActiveStatus}
            />
            <Toggle
              name="requirePublishedWebsite"
              label="Website must be published"
              defaultChecked={rules.requirePublishedWebsite}
            />
            <Toggle
              name="requireLogoOrCoverImage"
              label="Must have a logo or cover image"
              defaultChecked={rules.requireLogoOrCoverImage}
            />
            <Toggle
              name="requireLocation"
              label="Must have a location"
              defaultChecked={rules.requireLocation}
            />
            <Toggle
              name="requireContactMethod"
              label="Must have a contact method"
              defaultChecked={rules.requireContactMethod}
            />
            <Toggle
              name="requireAddress"
              label="Must have an address"
              defaultChecked={rules.requireAddress}
            />
            <Toggle
              name="requireModerationClear"
              label="No flagged content"
              defaultChecked={rules.requireModerationClear}
            />
          </div>
        </fieldset>

        <fieldset className="rounded-lg border border-neutral-700 bg-neutral-800 p-5">
          <legend className="px-2 text-sm font-semibold tracking-wide text-neutral-400 uppercase">
            Thresholds
          </legend>

          <div className="grid gap-4 sm:grid-cols-2">
            <Number
              name="minDescriptionLength"
              label="Minimum description length"
              defaultValue={rules.minDescriptionLength}
              hint="The strongest thin-content signal."
              max={5000}
            />
            <Number
              name="minBusinessNameLength"
              label="Minimum business name length"
              defaultValue={rules.minBusinessNameLength}
              max={200}
            />
            <Number
              name="minPublishedProducts"
              label="Minimum products"
              defaultValue={rules.minPublishedProducts}
              hint="Either this OR the services threshold clears the gate."
              max={100}
            />
            <Number
              name="minPublishedServices"
              label="Minimum services"
              defaultValue={rules.minPublishedServices}
              max={100}
            />
            <Number
              name="minProfileScore"
              label="Minimum profile score"
              defaultValue={rules.minProfileScore}
              hint="Out of 100."
              max={100}
            />
          </div>
        </fieldset>

        <button
          type="submit"
          className="rounded-md bg-white px-5 py-2.5 text-sm font-medium text-neutral-900"
        >
          Save rules
        </button>

        <p className="text-xs text-neutral-500">
          Applies to new evaluations immediately. Existing sellers are re-scored by the nightly job.
        </p>
      </form>

      <h2 className="mt-14 text-xl font-semibold tracking-tight">Billing</h2>
      <p className="mt-1 text-sm text-neutral-400">
        Shown to sellers on the upgrade page until online payments exist (decision D32). Plans
        themselves are assigned from each seller&rsquo;s admin page.
      </p>
      <form action={updateBillingSettingsAction} className="mt-6 space-y-4">
        <fieldset className="space-y-4 rounded-lg border border-neutral-700 bg-neutral-800 p-5">
          <legend className="px-2 text-sm font-semibold tracking-wide text-neutral-400 uppercase">
            How sellers pay
          </legend>
          <TextField
            name="supportWhatsapp"
            label="Support WhatsApp number (digits only, with country code — 919876543210)"
            defaultValue={billing.supportWhatsapp ?? ""}
          />
          <TextField
            name="supportEmail"
            label="Support email"
            defaultValue={billing.supportEmail ?? ""}
          />
          <TextField name="upiId" label="UPI id" defaultValue={billing.upiId ?? ""} />
          <label className="block text-sm">
            <span className="text-neutral-300">Instructions</span>
            <textarea
              name="instructions"
              rows={4}
              defaultValue={billing.instructions ?? ""}
              className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-neutral-100"
            />
          </label>
        </fieldset>
        <button
          type="submit"
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-200"
        >
          Save billing settings
        </button>
      </form>
    </div>
  );
}

function TextField({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue: string;
}) {
  return (
    <label className="block text-sm">
      <span className="text-neutral-300">{label}</span>
      <input
        type="text"
        name={name}
        defaultValue={defaultValue}
        className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-neutral-100"
      />
    </label>
  );
}

function Toggle({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-center gap-3 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} />
      <span>{label}</span>
    </label>
  );
}

function Number({
  name,
  label,
  defaultValue,
  hint,
  max,
}: {
  name: string;
  label: string;
  defaultValue: number;
  hint?: string;
  max: number;
}) {
  const id = `setting-${name}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        type="number"
        name={name}
        defaultValue={defaultValue}
        min={0}
        max={max}
        className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm tabular-nums"
      />
      {hint ? <p className="mt-1 text-xs text-neutral-500">{hint}</p> : null}
    </div>
  );
}
