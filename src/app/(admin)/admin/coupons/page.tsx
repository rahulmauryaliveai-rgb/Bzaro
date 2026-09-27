import Link from "next/link";
import { requirePermission } from "@/lib/auth/guards";
import { formatMoney } from "@/lib/utils/money";
import { describeCoupon } from "@/lib/billing/coupon";
import { listPublicPlans } from "@/server/services/plan.service";
import { listCouponsForAdmin, suggestCouponCode } from "@/server/services/coupon.service";
import { setCouponActiveAction } from "@/server/actions/admin-coupons";
import { CouponForm, type CouponPreset } from "@/components/admin/CouponForm";

/**
 * Coupons (D42). Presets cover the common offers; every field stays editable.
 * A coupon counts as used only when the seller's payment succeeds.
 */

const PRESETS: Record<
  string,
  { label: string; preset: Omit<CouponPreset, "code"> & { code?: string } }
> = {
  "pro-3-months-1": {
    label: "Pro 3 months for ₹1",
    preset: {
      code: "PRO3FOR1",
      description: "Launch offer: Pro for 3 months at ₹1, new sellers only",
      kind: "PLAN_PASS",
      planKey: "pro",
      passMonths: 3,
      passPriceRupees: 1,
      newSellersOnly: true,
      maxRedemptions: 500,
      endsInDays: 60,
    },
  },
  "gold-yearly-5000": {
    label: "₹5,000 off Gold yearly",
    preset: {
      code: "GOLDYEAR",
      description: "₹5,000 off the Gold yearly plan",
      kind: "FLAT_OFF",
      amountOffRupees: 5000,
      appliesTo: ["PLAN_YEARLY"],
      planKeys: ["gold"],
      endsInDays: 30,
    },
  },
  "lead-pack-99": {
    label: "Lead pack for ₹99",
    preset: {
      code: "LEADS99",
      description: "First lead pack for ₹99 (+GST)",
      kind: "FLAT_OFF",
      amountOffRupees: 400,
      appliesTo: ["LEAD_PACK"],
      newSellersOnly: true,
    },
  },
  "addons-20": {
    label: "20% off add-ons",
    preset: {
      code: "ADDON20",
      description: "20% off the payment gateway and shipping add-ons",
      kind: "PERCENT_OFF",
      percentOff: 20,
      appliesTo: ["PAYMENT_GATEWAY", "SHIPPING"],
      endsInDays: 30,
    },
  },
  partner: {
    label: "Partner / referral code",
    preset: {
      description: "Partner code — 10% off yearly plans",
      kind: "PERCENT_OFF",
      percentOff: 10,
      appliesTo: ["PLAN_YEARLY"],
    },
  },
};

type Props = { searchParams: Promise<{ preset?: string }> };

export default async function AdminCouponsPage({ searchParams }: Props) {
  await requirePermission("admin:plan:manage");
  const { preset: presetKey } = await searchParams;
  const [coupons, plans] = await Promise.all([listCouponsForAdmin(), listPublicPlans()]);
  const paidPlans = plans
    .filter((plan) => plan.priceMinor > 0)
    .map((p) => ({ key: p.key, name: p.name }));
  const planNames = new Map(plans.map((p) => [p.id, p.name]));

  const chosen = presetKey ? PRESETS[presetKey]?.preset : undefined;
  const preset: CouponPreset = {
    kind: "PERCENT_OFF",
    description: "",
    ...chosen,
    code: chosen?.code ?? suggestCouponCode(),
  };
  const inr = (minor: number) => formatMoney(minor, "INR");

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight">Coupons</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Sellers enter a code on Plan &amp; billing. A <strong>plan pass</strong> gives a plan for a
        few months at a fixed price with no autopay. A <strong>discount</strong> lowers the price
        before GST. A coupon is used up only when the seller&rsquo;s payment succeeds.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-neutral-500">Start from:</span>
        {Object.entries(PRESETS).map(([key, { label }]) => (
          <Link
            key={key}
            href={`/admin/coupons?preset=${key}`}
            className={`rounded-full border px-3 py-1 ${presetKey === key ? "border-white bg-white text-neutral-900" : "border-neutral-600 hover:bg-neutral-700"}`}
          >
            {label}
          </Link>
        ))}
        <Link href="/admin/coupons" className="text-xs text-neutral-500 underline">
          Blank
        </Link>
      </div>

      <div className="mt-4">
        <CouponForm key={presetKey ?? "blank"} preset={preset} plans={paidPlans} />
      </div>

      <h2 className="mt-10 text-lg font-semibold">All coupons</h2>
      {coupons.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-400">No coupons yet.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {coupons.map((coupon) => {
            const expired = coupon.endsAt !== null && coupon.endsAt < new Date();
            const full =
              coupon.maxRedemptions !== null && coupon.redemptionCount >= coupon.maxRedemptions;
            return (
              <li
                key={coupon.id}
                className="rounded-lg border border-neutral-700 bg-neutral-800 p-4 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="font-mono text-base font-semibold">{coupon.code}</span>
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                        !coupon.isActive
                          ? "bg-neutral-700 text-neutral-300"
                          : expired || full
                            ? "bg-amber-900/50 text-amber-200"
                            : "bg-green-900/50 text-green-200"
                      }`}
                    >
                      {!coupon.isActive ? "Off" : expired ? "Expired" : full ? "Used up" : "Live"}
                    </span>
                  </div>
                  <form action={setCouponActiveAction}>
                    <input type="hidden" name="id" value={coupon.id} />
                    <input type="hidden" name="active" value={coupon.isActive ? "0" : "1"} />
                    <button
                      type="submit"
                      className="rounded-md border border-neutral-600 px-3 py-1 hover:bg-neutral-700"
                    >
                      {coupon.isActive ? "Turn off" : "Turn on"}
                    </button>
                  </form>
                </div>
                <p className="mt-1">
                  {describeCoupon(
                    { ...coupon, planName: coupon.planId ? planNames.get(coupon.planId) : null },
                    inr,
                  )}
                </p>
                {coupon.description ? (
                  <p className="mt-0.5 text-xs text-neutral-400">{coupon.description}</p>
                ) : null}
                <p className="mt-1 text-xs text-neutral-500">
                  Used {coupon.redemptionCount}
                  {coupon.maxRedemptions !== null ? ` of ${coupon.maxRedemptions}` : ""} ·{" "}
                  {coupon.perSellerLimit} per seller
                  {coupon.newSellersOnly ? " · new sellers only" : ""}
                  {coupon.startsAt ? ` · from ${coupon.startsAt.toLocaleDateString("en-IN")}` : ""}
                  {coupon.endsAt
                    ? ` · until ${coupon.endsAt.toLocaleDateString("en-IN")}`
                    : " · no end date"}
                </p>
                {coupon.redemptions.length > 0 ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-neutral-400">
                      Recent uses ({coupon.redemptions.length})
                    </summary>
                    <ul className="mt-1 space-y-0.5 text-xs text-neutral-300">
                      {coupon.redemptions.map((r) => (
                        <li key={r.id}>
                          {r.createdAt.toLocaleString("en-IN")} ·{" "}
                          <Link href={`/admin/sellers/${r.seller.id}`} className="underline">
                            {r.seller.businessName}
                          </Link>
                          {r.discountMinor > 0 ? ` · saved ${inr(r.discountMinor)}` : ""}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
