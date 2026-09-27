import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircle, Mail, ShieldCheck, Receipt } from "lucide-react";
import { requireSeller } from "@/lib/auth/guards";
import { formatMoney } from "@/lib/utils/money";
import { withGst } from "@/lib/billing/gst";
import {
  getActivePlan,
  getLastUpgradeRequest,
  listPublicPlans,
} from "@/server/services/plan.service";
import {
  ADDON_LABEL,
  billingGatewayReady,
  getAddonOffers,
  getBillingHistory,
  getBillingSettings,
} from "@/server/services/billing.service";
import { REFUND_REASONS, getRefundableCandidate } from "@/server/services/refund.service";
import { getSellerProfile } from "@/server/services/seller.service";
import { cancelPlanAction, requestUpgradeAction } from "@/server/actions/billing";
import { PlanLadder, formatPlanPrice } from "@/components/billing/PlanLadder";
import { AddonBuyButton, SubscribeButton } from "@/components/billing/BillingCheckout";
import { RefundForm } from "@/components/billing/RefundForm";

export const metadata: Metadata = {
  title: "Plan & billing",
  robots: { index: false, follow: false },
};

/**
 * Plan & billing (D32, D41).
 *
 * With Bzaro's Razorpay billing keys set, every paid plan has "Pay monthly" /
 * "Pay yearly" buttons (Razorpay autopay) and every add-on a "Buy" button.
 * Without them, `?plan=<key>` keeps the manual path: how to pay by UPI, and a
 * "Notify the team" button that queues the request for an admin.
 */

type Props = { searchParams: Promise<{ plan?: string; requested?: string }> };

const dateFmt = (date: Date) =>
  date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export default async function BillingPage({ searchParams }: Props) {
  const scope = await requireSeller();
  const { plan: wantedKey, requested } = await searchParams;

  const [subscription, plans, profile, settings, lastRequest, offers, history, refundable] =
    await Promise.all([
      getActivePlan(scope.sellerId),
      listPublicPlans(),
      getSellerProfile(scope.sellerId),
      getBillingSettings(),
      getLastUpgradeRequest(scope.sellerId),
      getAddonOffers(scope.sellerId),
      getBillingHistory(scope.sellerId),
      getRefundableCandidate(scope.sellerId),
    ]);

  const online = billingGatewayReady();
  const currentKey = subscription?.plan.key ?? "free";
  const wanted = plans.find((plan) => plan.key === wantedKey && plan.key !== currentKey);
  const gst = settings.gstRatePercent;
  const pastDue = subscription?.status === "PAST_DUE";
  // A plan the seller is paying for by autopay and has not cancelled (D41).
  const paidAutopay = Boolean(
    subscription &&
    subscription.plan.priceMinor > 0 &&
    subscription.gatewaySubscriptionId &&
    !subscription.cancelAtPeriodEnd,
  );
  const onYearly = paidAutopay && subscription?.interval === "YEARLY";
  const currentRank = subscription?.plan.sortOrder ?? 0;
  const openRefund = history.payments.find((payment) =>
    payment.refunds.some((refund) => refund.status === "REQUESTED" || refund.status === "APPROVED"),
  );

  return (
    <div className="max-w-5xl space-y-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Plan &amp; billing</h1>
        <p className="mt-1 text-sm text-neutral-600">
          You are on the <strong>{subscription?.plan.name ?? "Free"}</strong> plan
          {subscription && subscription.plan.priceMinor > 0 ? (
            <>
              {" "}
              · billed {subscription.interval === "YEARLY" ? "yearly" : "monthly"} ·{" "}
              {subscription.cancelAtPeriodEnd ? "ends" : "renews"} on{" "}
              {dateFmt(subscription.currentPeriodEnd)}
            </>
          ) : null}
          .
        </p>
      </header>

      {pastDue && subscription?.gracePeriodEndsAt ? (
        <div
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <p className="font-semibold">Your last renewal did not go through.</p>
          <p className="mt-1">
            Razorpay is retrying automatically. Please check your UPI app or card. Your{" "}
            {subscription.plan.name} features stay on until{" "}
            {dateFmt(subscription.gracePeriodEndsAt)}; after that the account moves to Free.
          </p>
        </div>
      ) : null}

      {subscription?.cancelAtPeriodEnd ? (
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
          Autopay is cancelled. You keep {subscription.plan.name} until{" "}
          {dateFmt(subscription.currentPeriodEnd)}, then move to Free. Subscribe again any time
          below.
        </div>
      ) : null}

      {/* ── Plans ─────────────────────────────────────────────────────────── */}
      <section>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-semibold">Plans</h2>
          <p className="text-xs text-neutral-500">
            Prices exclude {gst}% GST, added at checkout. Autopay by UPI, card or net banking.
          </p>
        </div>
        <PlanLadder
          plans={plans}
          currentPlanKey={currentKey}
          slug={scope.sellerSlug}
          ctaHref={(plan) => `/dashboard/billing?plan=${plan.key}`}
          ctaLabel="Choose plan"
          renderCta={
            online
              ? (plan, { isCurrent, isHighlight, isGold }) => {
                  if (plan.priceMinor === 0) {
                    return isCurrent ? (
                      <span className="inline-flex w-full justify-center rounded-lg border border-neutral-200 px-4 py-2.5 text-sm font-medium text-neutral-500">
                        You are on this plan
                      </span>
                    ) : (
                      <p className="text-center text-xs text-neutral-500">
                        Cancel autopay below to return to Free at the end of your period.
                      </p>
                    );
                  }
                  const monthly = withGst(plan.priceMinor, gst);
                  const yearly = plan.yearlyPriceMinor ? withGst(plan.yearlyPriceMinor, gst) : null;

                  // The seller's own autopay plan: say what they are on, and
                  // offer only the one sensible move — monthly → yearly.
                  if (isCurrent && paidAutopay) {
                    return (
                      <div className="space-y-2">
                        <div className="bg-accent-50 text-accent-900 rounded-lg px-4 py-2.5 text-center text-sm">
                          <p className="font-semibold">
                            Your plan · billed {onYearly ? "yearly" : "monthly"}
                          </p>
                          {subscription ? (
                            <p className="text-xs">
                              Renews {dateFmt(subscription.currentPeriodEnd)}
                            </p>
                          ) : null}
                        </div>
                        {!onYearly && yearly ? (
                          <SubscribeButton
                            planKey={plan.key}
                            interval="YEARLY"
                            variant="secondary"
                            label={`Switch to yearly · ${formatMoney(yearly.totalMinor, "INR")}`}
                          />
                        ) : null}
                      </div>
                    );
                  }

                  // A lower plan while a paid plan is running: switching now
                  // would throw away paid time, so point to cancel-at-period-end.
                  if (paidAutopay && plan.sortOrder < currentRank) {
                    return (
                      <p className="rounded-lg bg-neutral-50 px-3 py-2.5 text-center text-xs text-neutral-600">
                        To move to {plan.name}, cancel autopay below. Your current plan runs until{" "}
                        {subscription
                          ? dateFmt(subscription.currentPeriodEnd)
                          : "the end of the period"}
                        ; then choose {plan.name} here.
                      </p>
                    );
                  }

                  return (
                    <div className="space-y-2">
                      {/* A yearly subscriber is never offered a monthly price (D41). */}
                      {!onYearly ? (
                        <SubscribeButton
                          planKey={plan.key}
                          interval="MONTHLY"
                          variant={isGold ? "gold" : isHighlight ? "primary" : "secondary"}
                          label={`Pay monthly · ${formatMoney(monthly.totalMinor, "INR")}`}
                        />
                      ) : null}
                      {yearly ? (
                        <SubscribeButton
                          planKey={plan.key}
                          interval="YEARLY"
                          variant={
                            isGold ? "gold" : onYearly || isHighlight ? "primary" : "secondary"
                          }
                          label={`${paidAutopay ? "Upgrade" : "Pay"} yearly · ${formatMoney(yearly.totalMinor, "INR")}`}
                        />
                      ) : null}
                      <p className="text-center text-[11px] text-neutral-500">
                        Amounts include GST
                      </p>
                    </div>
                  );
                }
              : undefined
          }
        />
        {online && subscription && subscription.plan.priceMinor > 0 ? (
          <p className="mt-4 text-xs text-neutral-500">
            Upgrading starts the new plan today and ends the current one — there is no pro-rata
            credit for the unused part. Lead credits are topped up to the new plan straight away.
          </p>
        ) : null}
      </section>

      {/* ── Manual payment (no gateway, or chosen from /pricing) ─────────── */}
      {wanted && !online ? (
        <section className="border-brand-200 bg-brand-50 rounded-2xl border p-6">
          <h2 className="text-lg font-semibold text-neutral-900">
            Upgrade to {wanted.name} — {formatPlanPrice(wanted).amount}{" "}
            <span className="text-sm font-normal text-neutral-600">
              {formatPlanPrice(wanted).period}
            </span>
          </h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            {settings.upiId ? (
              <div className="rounded-lg bg-white p-3">
                <dt className="text-xs tracking-wide text-neutral-500 uppercase">Pay via UPI</dt>
                <dd className="mt-0.5 font-mono font-medium">{settings.upiId}</dd>
              </div>
            ) : null}
            <div className="rounded-lg bg-white p-3">
              <dt className="text-xs tracking-wide text-neutral-500 uppercase">Reference</dt>
              <dd className="mt-0.5 font-mono font-medium">
                {scope.sellerSlug} / {wanted.key}
              </dd>
            </div>
          </dl>
          {settings.instructions ? (
            <p className="mt-4 text-sm whitespace-pre-line text-neutral-700">
              {settings.instructions}
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {settings.supportWhatsapp ? (
              <a
                href={`https://wa.me/${settings.supportWhatsapp}?text=${encodeURIComponent(
                  `Hi, I want to upgrade ${profile?.businessName ?? scope.sellerSlug} (${scope.sellerSlug}) to the ${wanted.name} plan.`,
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-accent-600 hover:bg-accent-700 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white"
              >
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                Message us on WhatsApp
              </a>
            ) : null}
            {settings.supportEmail ? (
              <a
                href={`mailto:${settings.supportEmail}?subject=${encodeURIComponent(
                  `Upgrade ${scope.sellerSlug} to ${wanted.name}`,
                )}`}
                className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium hover:bg-neutral-50"
              >
                <Mail className="h-4 w-4" aria-hidden="true" />
                Email us
              </a>
            ) : null}
            <form action={requestUpgradeAction}>
              <input type="hidden" name="plan" value={wanted.key} />
              <button
                type="submit"
                className="border-brand-300 text-brand-800 hover:bg-brand-100 inline-flex items-center rounded-lg border bg-white px-4 py-2.5 text-sm font-medium"
              >
                Notify the Bzaro team
              </button>
            </form>
          </div>
          {requested || lastRequest ? (
            <p className="mt-3 text-xs text-neutral-600">
              {lastRequest
                ? `Last request sent ${lastRequest.createdAt.toLocaleString("en-IN")}. We will activate the plan once payment is confirmed.`
                : null}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* ── Add-ons ───────────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold">Add-ons</h2>
        <p className="mt-1 text-sm text-neutral-600">
          One-time payments. Prices exclude {gst}% GST.
        </p>
        <ul className="mt-4 grid gap-4 md:grid-cols-3">
          {offers.map((offer) => (
            <li
              key={offer.kind}
              className="flex flex-col rounded-2xl border border-neutral-200 bg-white p-5"
            >
              <h3 className="font-semibold text-neutral-900">
                {offer.kind === "LEAD_PACK" ? offer.label : ADDON_LABEL[offer.kind]}
              </h3>
              <p className="mt-1 flex-1 text-sm text-neutral-600">
                {offer.kind === "LEAD_PACK"
                  ? "Unlock buyer contact details for matched requirements. Credits never expire."
                  : offer.kind === "PAYMENT_GATEWAY"
                    ? "Add to cart, checkout and online payments (your own Razorpay) plus cash on delivery on your website."
                    : "Book pickups and track orders with Shiprocket straight from your Orders page."}
              </p>
              <p className="mt-3 text-xl font-bold tabular-nums">
                {formatMoney(offer.quote.baseMinor, "INR")}{" "}
                <span className="text-xs font-normal text-neutral-500">
                  + GST = {formatMoney(offer.quote.totalMinor, "INR")}
                  {offer.kind === "LEAD_PACK" ? "" : " · one time"}
                </span>
              </p>
              <div className="mt-4">
                {offer.owned ? (
                  <span className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-green-50 px-4 py-2.5 text-sm font-medium text-green-800">
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                    {offer.reason ?? "Active"}
                  </span>
                ) : online ? (
                  <AddonBuyButton
                    kind={offer.kind}
                    label={`Buy · ${formatMoney(offer.quote.totalMinor, "INR")}`}
                    disabled={!offer.available}
                  />
                ) : (
                  <p className="text-xs text-neutral-500">Contact us to buy this add-on.</p>
                )}
                {!offer.owned && offer.reason ? (
                  <p className="mt-2 text-xs text-neutral-500">{offer.reason}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* ── History & refunds ─────────────────────────────────────────────── */}
      <section>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Receipt className="h-5 w-5 text-neutral-500" aria-hidden="true" />
          Payments &amp; invoices
        </h2>
        {history.payments.length === 0 && history.purchases.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-600">No payments yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs text-neutral-500 uppercase">
                <tr>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Item</th>
                  <th className="px-4 py-2 text-right font-medium">Amount</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Invoice</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {[
                  ...history.payments.map((payment) => ({
                    key: `p-${payment.id}`,
                    date: payment.paidAt ?? payment.createdAt,
                    item: `${payment.subscription.plan.name} plan (${payment.subscription.interval === "YEARLY" ? "yearly" : "monthly"})`,
                    amount: payment.amountMinor,
                    status:
                      payment.refundedMinor > 0
                        ? "Refunded"
                        : payment.refunds[0]?.status === "REQUESTED"
                          ? "Refund requested"
                          : payment.refunds[0]?.status === "REJECTED"
                            ? "Paid · refund declined"
                            : "Paid",
                    invoice: payment.invoiceNumber
                      ? `/dashboard/billing/invoice/payment/${payment.id}`
                      : null,
                    number: payment.invoiceNumber,
                  })),
                  ...history.purchases.map((purchase) => ({
                    key: `a-${purchase.id}`,
                    date: purchase.paidAt ?? purchase.createdAt,
                    item:
                      purchase.kind === "LEAD_PACK"
                        ? `Lead pack · ${purchase.quantity} credits`
                        : ADDON_LABEL[purchase.kind],
                    amount: purchase.totalMinor,
                    status: purchase.status === "REFUNDED" ? "Refunded" : "Paid",
                    invoice: purchase.invoiceNumber
                      ? `/dashboard/billing/invoice/purchase/${purchase.id}`
                      : null,
                    number: purchase.invoiceNumber,
                  })),
                ]
                  .sort((a, b) => b.date.getTime() - a.date.getTime())
                  .map((row) => (
                    <tr key={row.key}>
                      <td className="px-4 py-2 whitespace-nowrap text-neutral-600">
                        {dateFmt(row.date)}
                      </td>
                      <td className="px-4 py-2">{row.item}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {formatMoney(row.amount, "INR")}
                      </td>
                      <td className="px-4 py-2 text-neutral-600">{row.status}</td>
                      <td className="px-4 py-2">
                        {row.invoice ? (
                          <Link
                            href={row.invoice}
                            className="text-brand-700 underline underline-offset-2"
                          >
                            {row.number}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50 p-5">
          <h3 className="font-semibold text-neutral-900">Not getting leads in your category?</h3>
          <p className="mt-1 text-sm text-neutral-600">
            If Bzaro is not sending you buyer leads for your products or services, you can ask for a
            refund of your plan payment within {settings.refundWindowDays} days of paying. Add-ons
            and lead packs are not refundable.
          </p>
          <div className="mt-3">
            {openRefund ? (
              <p className="text-sm text-neutral-700">
                Your refund request is being reviewed. We reply by email within 2 working days.
              </p>
            ) : refundable ? (
              <RefundForm
                paymentId={refundable.paymentId}
                reasons={REFUND_REASONS}
                amountLabel={formatMoney(refundable.amountMinor, "INR")}
                deadlineLabel={dateFmt(refundable.deadline)}
              />
            ) : (
              <p className="text-xs text-neutral-500">
                No plan payment in the last {settings.refundWindowDays} days is eligible right now.
              </p>
            )}
          </div>
        </div>

        {subscription && subscription.plan.priceMinor > 0 && !subscription.cancelAtPeriodEnd ? (
          <form action={cancelPlanAction} className="mt-6">
            <button
              type="submit"
              className="text-sm text-neutral-500 underline underline-offset-2 hover:text-neutral-800"
            >
              Cancel autopay (keep {subscription.plan.name} until{" "}
              {dateFmt(subscription.currentPeriodEnd)})
            </button>
          </form>
        ) : null}
        <p className="mt-4 text-xs text-neutral-500">
          <Link href="/dashboard/credits" className="underline underline-offset-2">
            About lead credits
          </Link>{" "}
          · A website that is no longer included redirects to your catalogue page on Bzaro, so your
          links keep working.
        </p>
      </section>
    </div>
  );
}
