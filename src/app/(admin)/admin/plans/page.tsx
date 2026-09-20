import { requirePermission } from "@/lib/auth/guards";
import { listPlansForAdmin } from "@/server/services/admin-billing.service";
import { savePlanAction } from "@/server/actions/admin-plans";
import { formatMoney } from "@/lib/utils/money";

/**
 * Plan editor (D5, D32). Every quota, credit grant and the web-presence tier
 * is data here; saving a plan re-derives the tier of every seller on it.
 * The public /pricing page and the dashboard ladder render from these rows,
 * so what is edited here is what sellers see within the hour.
 */

type Plan = Awaited<ReturnType<typeof listPlansForAdmin>>[number];

export default async function AdminPlansPage() {
  await requirePermission("admin:plan:manage");
  const plans = await listPlansForAdmin();

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight">Plans</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Prices in rupees, excluding GST. <strong>Web presence</strong> decides what the plan buys on
        the web: catalogue page only, a subdomain website, or the seller&rsquo;s own domain (D32).
        Inactive plans disappear from pricing but keep their subscribers.
      </p>

      <div className="mt-6 space-y-4">
        {plans.map((plan) => (
          <PlanForm key={plan.id} plan={plan} />
        ))}
        <details className="rounded-lg border border-dashed border-neutral-600 bg-neutral-800/60">
          <summary className="cursor-pointer px-5 py-3 text-sm font-medium">+ New plan</summary>
          <div className="border-t border-neutral-700 px-5 py-4">
            <PlanForm plan={null} />
          </div>
        </details>
      </div>
    </div>
  );
}

function PlanForm({ plan }: { plan: Plan | null }) {
  const subscribers = plan?._count.subscriptions ?? 0;
  return (
    <form
      action={savePlanAction}
      className={`rounded-lg border border-neutral-700 bg-neutral-800 p-5 ${plan?.isActive === false ? "opacity-70" : ""}`}
    >
      {plan ? <input type="hidden" name="id" value={plan.id} /> : null}
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">
          {plan ? plan.name : "New plan"}
          {plan ? (
            <span className="ml-3 text-sm font-normal text-neutral-400">
              {formatMoney(plan.priceMinor, plan.currency)} / {plan.interval.toLowerCase()} ·{" "}
              {subscribers} live subscriber{subscribers === 1 ? "" : "s"}
            </span>
          ) : null}
        </h2>
        {plan && !plan.isActive ? (
          <span className="rounded-full bg-neutral-700 px-2 py-0.5 text-xs">Inactive</span>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Text label="Key" name="key" defaultValue={plan?.key ?? ""} placeholder="pro" required />
        <Text label="Name" name="name" defaultValue={plan?.name ?? ""} required />
        <Text
          label="Price (₹)"
          name="priceRupees"
          type="number"
          defaultValue={plan ? String(plan.priceMinor / 100) : "0"}
          min={0}
          step="1"
          required
        />
        <label className="flex flex-col gap-1">
          <span className="text-xs text-neutral-500">Billing interval</span>
          <select name="interval" defaultValue={plan?.interval ?? "MONTHLY"} className={input}>
            <option value="MONTHLY">Monthly</option>
            <option value="QUARTERLY">Quarterly</option>
            <option value="YEARLY">Yearly</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-4">
          <span className="text-xs text-neutral-500">Description (one line on pricing)</span>
          <input
            name="description"
            defaultValue={plan?.description ?? ""}
            maxLength={200}
            className={input}
          />
        </label>

        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs text-neutral-500">Web presence (D32)</span>
          <select
            name="webPresence"
            defaultValue={plan?.webPresence ?? "CATALOGUE"}
            className={input}
          >
            <option value="CATALOGUE">Catalogue page on Bzaro only</option>
            <option value="SUBDOMAIN">Subdomain website ({"{slug}"}.bzaro.in)</option>
            <option value="CUSTOM_DOMAIN">Website on the seller&rsquo;s own domain</option>
          </select>
        </label>
        <Text
          label="Lead credits / month (blank = unlimited)"
          name="leadCreditsPerMonth"
          type="number"
          defaultValue={plan?.leadCreditsPerMonth == null ? "" : String(plan.leadCreditsPerMonth)}
          min={0}
        />
        <Text
          label="Search boost"
          name="searchBoost"
          type="number"
          defaultValue={String(plan?.searchBoost ?? 0)}
          min={0}
        />

        <Text
          label="Max products"
          name="maxProducts"
          type="number"
          defaultValue={String(plan?.maxProducts ?? 10)}
          min={0}
          required
        />
        <Text
          label="Max services"
          name="maxServices"
          type="number"
          defaultValue={String(plan?.maxServices ?? 5)}
          min={0}
          required
        />
        <Text
          label="Max gallery photos"
          name="maxGalleryItems"
          type="number"
          defaultValue={String(plan?.maxGalleryItems ?? 10)}
          min={0}
          required
        />
        <Text
          label="Max categories"
          name="maxCategories"
          type="number"
          defaultValue={String(plan?.maxCategories ?? 3)}
          min={1}
          required
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <Check
          name="allowPremiumTemplates"
          label="Premium templates"
          defaultChecked={plan?.allowPremiumTemplates ?? false}
        />
        <Check
          name="removeBranding"
          label="Remove Bzaro branding"
          defaultChecked={plan?.removeBranding ?? false}
        />
        <Check
          name="prioritySupport"
          label="Priority support"
          defaultChecked={plan?.prioritySupport ?? false}
        />
        <Check
          name="isActive"
          label="Active (shown on pricing)"
          defaultChecked={plan?.isActive ?? true}
        />
        <label className="ml-auto flex items-center gap-2">
          <span className="text-xs text-neutral-500">Order</span>
          <input
            name="sortOrder"
            type="number"
            min={0}
            defaultValue={plan?.sortOrder ?? 10}
            className={`${input} w-16`}
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-white px-4 py-1.5 font-medium text-neutral-900 hover:bg-neutral-200"
        >
          {plan ? "Save plan" : "Create plan"}
        </button>
      </div>
    </form>
  );
}

function Text({
  label,
  name,
  defaultValue,
  type = "text",
  placeholder,
  required,
  min,
  step,
}: {
  label: string;
  name: string;
  defaultValue: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  min?: number;
  step?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-neutral-500">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        min={min}
        step={step}
        className={input}
      />
    </label>
  );
}

function Check({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} />
      {label}
    </label>
  );
}

const input = "rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-neutral-100";
