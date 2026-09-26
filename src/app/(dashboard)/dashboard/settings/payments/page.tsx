import type { Metadata } from "next";
import Link from "next/link";
import { requireSeller } from "@/lib/auth/guards";
import {
  getIntegrationSummary,
  getSellerFeatures,
} from "@/server/services/integration.service";
import { encryptionAvailable } from "@/lib/crypto/secrets";
import { marketplaceUrl } from "@/lib/utils/url";
import {
  CodToggle,
  EnableToggle,
  RazorpayForm,
  TestConnectionButton,
} from "@/components/dashboard/IntegrationForms";

export const metadata: Metadata = {
  title: "Payments",
  robots: { index: false, follow: false },
};

/**
 * Razorpay settings (Phase 6).
 *
 * The keys are the seller's own, so the money never passes through Bzaro. That
 * is worth stating plainly on the page: it is the answer to the question every
 * seller asks before pasting a live secret into someone else's software.
 */
export default async function PaymentsSettingsPage() {
  const scope = await requireSeller();

  const [features, integration] = await Promise.all([
    getSellerFeatures(scope.sellerId),
    getIntegrationSummary(scope.sellerId, "RAZORPAY"),
  ]);

  if (!features.paymentsEnabled) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-xl font-semibold">Payments</h1>
        <div className="mt-5 rounded-lg border border-neutral-200 bg-neutral-50 p-5">
          <h2 className="text-base font-semibold">Take orders directly on your store</h2>
          <p className="mt-2 text-sm text-neutral-700">
            With payments switched on, your products get an <strong>Add to cart</strong> button and
            buyers check out on your storefront. Orders land in your Orders tab. The money goes
            straight to your own Razorpay account — Bzaro never holds it.
          </p>
          <Link
            href="/dashboard/billing"
            className="mt-4 inline-flex min-h-11 items-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Upgrade or buy the add-on
          </Link>
        </div>
      </div>
    );
  }

  const webhookUrl = marketplaceUrl("/api/webhooks/razorpay");

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Payments</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Your own Razorpay account. Bzaro never holds your money — we only ask Razorpay to create
          the order.
        </p>
      </div>

      {!encryptionAvailable() ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          This deployment has no encryption key configured, so credentials cannot be stored
          securely yet. Ask an administrator to set <code>INTEGRATIONS_ENCRYPTION_KEY</code>.
        </p>
      ) : null}

      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">Status</h2>
            <p className="mt-1 text-sm text-neutral-600">
              {integration?.enabled
                ? `Online payment is ON (${integration.mode.toLowerCase()} mode).`
                : features.codEnabled
                  ? "Your store takes orders with cash on delivery. Add Razorpay keys below to also accept online payment."
                  : "Payments are off. Buyers see “Get Quote” instead of “Add to cart” — turn on cash on delivery or add Razorpay keys."}
            </p>
            {integration?.lastTestedAt ? (
              <p className="mt-1 text-xs text-neutral-500">
                Last test {integration.lastTestOk ? "succeeded" : "failed"} on{" "}
                {integration.lastTestedAt.toLocaleString("en-IN")}
                {integration.lastTestError ? ` — ${integration.lastTestError}` : ""}
              </p>
            ) : null}
          </div>
          {integration ? <EnableToggle kind="razorpay" enabled={integration.enabled} /> : null}
        </div>
        {integration ? <TestConnectionButton /> : null}
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="mb-3 text-base font-semibold">Cash on delivery</h2>
        <CodToggle codEnabled={features.codEnabled} />
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="mb-4 text-base font-semibold">Razorpay keys</h2>
        <RazorpayForm hint={integration?.hint ?? null} mode={integration?.mode ?? "TEST"} />
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="text-base font-semibold">Set up the webhook</h2>
        <ol className="mt-3 space-y-3 text-sm text-neutral-700">
          <li>
            1. In Razorpay Dashboard, open <strong>Settings → Webhooks → Add New Webhook</strong>.
          </li>
          <li>
            2. Paste this URL:
            <code className="mt-1 block rounded bg-neutral-100 px-2 py-1 text-xs break-all">
              {webhookUrl}
            </code>
          </li>
          <li>
            3. Choose a secret of your own, and tick the <strong>payment.captured</strong> event.
          </li>
          <li>4. Paste that same secret into “Webhook Secret” above, and save.</li>
        </ol>
        <p className="mt-3 text-xs text-neutral-500">
          The webhook is what confirms an order when a buyer closes the tab before being redirected
          back. Without it, some paid orders would sit as pending.
        </p>
      </section>
    </div>
  );
}
