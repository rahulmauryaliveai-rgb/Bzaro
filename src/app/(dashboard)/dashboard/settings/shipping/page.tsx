import type { Metadata } from "next";
import Link from "next/link";
import { requireSeller } from "@/lib/auth/guards";
import {
  getIntegrationSummary,
  getSellerFeatures,
  getShiprocketConfig,
} from "@/server/services/integration.service";
import { encryptionAvailable } from "@/lib/crypto/secrets";
import {
  AutoShipToggle,
  EnableToggle,
  ShiprocketForm,
} from "@/components/dashboard/IntegrationForms";

export const metadata: Metadata = {
  title: "Shipping",
  robots: { index: false, follow: false },
};

export default async function ShippingSettingsPage() {
  const scope = await requireSeller();

  const [features, integration, stored] = await Promise.all([
    getSellerFeatures(scope.sellerId),
    getIntegrationSummary(scope.sellerId, "SHIPROCKET"),
    getShiprocketConfig(scope.sellerId),
  ]);
  const config = stored?.config;
  const numeric = (value: number | undefined) => (value === undefined ? undefined : String(value));

  if (!features.shippingEnabled) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-xl font-semibold">Shipping</h1>
        <div className="mt-5 rounded-lg border border-neutral-200 bg-neutral-50 p-5">
          <h2 className="text-base font-semibold">Book couriers without leaving Bzaro</h2>
          <p className="mt-2 text-sm text-neutral-700">
            Connect your Shiprocket account to create shipments from a paid order, print labels and
            send tracking links to buyers automatically.
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

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Shipping</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Your own Shiprocket account. Create a dedicated API user rather than using your login —
          it can be revoked without locking you out.
        </p>
      </div>

      {!encryptionAvailable() ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          This deployment has no encryption key configured, so credentials cannot be stored
          securely yet. Ask an administrator to set <code>INTEGRATIONS_ENCRYPTION_KEY</code>.
        </p>
      ) : null}

      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">Status</h2>
            <p className="mt-1 text-sm text-neutral-600">
              {integration?.enabled
                ? `Shipping is ON (${integration.mode.toLowerCase()} mode).`
                : "Shipping is off. You can still mark orders shipped by hand."}
            </p>
          </div>
          {integration ? <EnableToggle kind="shiprocket" enabled={integration.enabled} /> : null}
        </div>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="mb-4 text-base font-semibold">Shiprocket API user</h2>
        <ShiprocketForm
          hint={integration?.hint ?? null}
          mode={integration?.mode ?? "TEST"}
          defaults={{
            pickupLocation: config?.pickupLocation,
            defaultWeightKg: numeric(config?.defaultWeightKg),
            defaultLengthCm: numeric(config?.defaultLengthCm),
            defaultBreadthCm: numeric(config?.defaultBreadthCm),
            defaultHeightCm: numeric(config?.defaultHeightCm),
          }}
        />
      </section>

      {integration?.enabled ? (
        <section className="rounded-lg border border-neutral-200 bg-white p-5">
          <h2 className="mb-3 text-base font-semibold">When to book</h2>
          <AutoShipToggle autoCreate={config?.autoCreate ?? false} />
        </section>
      ) : null}
    </div>
  );
}
