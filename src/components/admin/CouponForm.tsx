"use client";

import { useActionState, useState } from "react";
import { createCouponAction, type CouponFormState } from "@/server/actions/admin-coupons";
import { COUPON_TARGETS, TARGET_LABEL } from "@/lib/billing/coupon";

/**
 * Create a coupon (D42). The kind picks which fields matter: a plan pass
 * (plan + months + price incl. GST) or a discount (% or ₹, what it applies to).
 * Presets fill the form; the admin can change anything before saving.
 */

export type CouponPreset = {
  code: string;
  description: string;
  kind: "PLAN_PASS" | "PERCENT_OFF" | "FLAT_OFF";
  planKey?: string;
  passMonths?: number;
  passPriceRupees?: number;
  percentOff?: number;
  amountOffRupees?: number;
  appliesTo?: string[];
  planKeys?: string[];
  maxRedemptions?: number;
  newSellersOnly?: boolean;
  endsInDays?: number;
};

const input = "rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-neutral-100";

function isoDate(daysFromNow: number): string {
  const date = new Date(Date.now() + daysFromNow * 86_400_000);
  return date.toISOString().slice(0, 10);
}

export function CouponForm({
  preset,
  plans,
}: {
  preset: CouponPreset;
  plans: { key: string; name: string }[];
}) {
  const [state, action, pending] = useActionState<CouponFormState, FormData>(
    createCouponAction,
    {},
  );
  const [kind, setKind] = useState(preset.kind);

  return (
    <form
      action={action}
      className="space-y-4 rounded-lg border border-neutral-700 bg-neutral-800 p-5 text-sm"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-neutral-500">Code (what sellers type)</span>
          <input
            name="code"
            defaultValue={preset.code}
            required
            maxLength={30}
            className={`${input} font-mono uppercase`}
          />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs text-neutral-500">Note (admins only)</span>
          <input
            name="description"
            defaultValue={preset.description}
            maxLength={200}
            className={input}
          />
        </label>
      </div>

      <fieldset className="flex flex-wrap gap-4">
        <legend className="mb-1 text-xs text-neutral-500">Type</legend>
        {(
          [
            ["PLAN_PASS", "Plan pass — a plan for N months at a fixed price"],
            ["PERCENT_OFF", "% off"],
            ["FLAT_OFF", "₹ off"],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="flex items-center gap-2">
            <input
              type="radio"
              name="kind"
              value={value}
              checked={kind === value}
              onChange={() => setKind(value)}
            />
            {label}
          </label>
        ))}
      </fieldset>

      {kind === "PLAN_PASS" ? (
        <div className="grid gap-3 rounded-md border border-neutral-700 p-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-neutral-500">Plan</span>
            <select name="planKey" defaultValue={preset.planKey ?? "pro"} className={input}>
              {plans.map((plan) => (
                <option key={plan.key} value={plan.key}>
                  {plan.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-neutral-500">Months</span>
            <input
              name="passMonths"
              type="number"
              min={1}
              max={36}
              defaultValue={preset.passMonths ?? 3}
              className={input}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-neutral-500">
              Seller pays (₹, GST included; 0 = free)
            </span>
            <input
              name="passPriceRupees"
              type="number"
              min={0}
              step="0.01"
              defaultValue={preset.passPriceRupees ?? 1}
              className={input}
            />
          </label>
          <p className="text-xs text-neutral-500 sm:col-span-3">
            No autopay. The plan starts on payment and ends after the months above; the seller can
            subscribe to continue. Only sellers without a running paid plan can use it.
          </p>
        </div>
      ) : (
        <div className="space-y-3 rounded-md border border-neutral-700 p-3">
          {kind === "PERCENT_OFF" ? (
            <label className="flex max-w-xs flex-col gap-1">
              <span className="text-xs text-neutral-500">Percent off (before GST)</span>
              <input
                name="percentOff"
                type="number"
                min={1}
                max={100}
                defaultValue={preset.percentOff ?? 20}
                className={input}
              />
            </label>
          ) : (
            <label className="flex max-w-xs flex-col gap-1">
              <span className="text-xs text-neutral-500">Amount off (₹, before GST)</span>
              <input
                name="amountOffRupees"
                type="number"
                min={1}
                step="0.01"
                defaultValue={preset.amountOffRupees ?? 500}
                className={input}
              />
            </label>
          )}
          <fieldset>
            <legend className="mb-1 text-xs text-neutral-500">
              Applies to (none ticked = everything)
            </legend>
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              {COUPON_TARGETS.map((target) => (
                <label key={target} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="appliesTo"
                    value={target}
                    defaultChecked={preset.appliesTo?.includes(target)}
                  />
                  {TARGET_LABEL[target]}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-1 text-xs text-neutral-500">
              Only these plans (none ticked = every paid plan)
            </legend>
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              {plans.map((plan) => (
                <label key={plan.key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="planKeys"
                    value={plan.key}
                    defaultChecked={preset.planKeys?.includes(plan.key)}
                  />
                  {plan.name}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="text-xs text-neutral-500">
            On an autopay plan the discount applies to every renewal of that subscription. For a
            one-off plan offer, use a plan pass.
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-neutral-500">Starts (optional)</span>
          <input name="startsAt" type="date" className={input} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-neutral-500">Ends (optional)</span>
          <input
            name="endsAt"
            type="date"
            defaultValue={preset.endsInDays ? isoDate(preset.endsInDays) : ""}
            className={input}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-neutral-500">Total uses (blank = unlimited)</span>
          <input
            name="maxRedemptions"
            type="number"
            min={1}
            defaultValue={preset.maxRedemptions ?? ""}
            className={input}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-neutral-500">Uses per seller</span>
          <input
            name="perSellerLimit"
            type="number"
            min={1}
            max={100}
            defaultValue={1}
            className={input}
          />
        </label>
      </div>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          name="newSellersOnly"
          defaultChecked={preset.newSellersOnly ?? false}
        />
        New sellers only (never paid Bzaro before)
      </label>

      {state.error ? <p className="text-red-400">{state.error}</p> : null}
      {state.ok ? <p className="text-green-400">Coupon created — it is live now.</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-white px-4 py-1.5 font-medium text-neutral-900 hover:bg-neutral-200 disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create coupon"}
      </button>
    </form>
  );
}
