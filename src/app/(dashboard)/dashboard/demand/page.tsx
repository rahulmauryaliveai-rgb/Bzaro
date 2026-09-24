import type { Metadata } from "next";
import { requireSeller } from "@/lib/auth/guards";
import { forSeller } from "@/lib/db-tenant";

export const metadata: Metadata = {
  title: "Demand alerts",
  robots: { index: false, follow: false },
};

/**
 * Anonymous demand signals (Phase 7).
 *
 * These come from orders placed with OTHER sellers in your category and city.
 * They deliberately carry no buyer details at all — the buyer chose someone
 * else, so there is nobody here to contact. What they are for is the decision
 * a seller makes next: stock it, price it, or ignore it.
 */
export default async function DemandAlertsPage() {
  const scope = await requireSeller();
  const db = forSeller(scope.sellerId);

  const alerts = await db.demandAlert.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      productName: true,
      quantityBand: true,
      createdAt: true,
      readAt: true,
      category: { select: { name: true } },
      location: { select: { name: true } },
    },
  });

  const unread = alerts.filter((alert) => !alert.readAt).length;

  // Opening the page is the read. There is nothing to act on individually, so
  // a per-row "mark read" would be friction for its own sake.
  if (unread > 0) {
    await db.demandAlert.updateMany({
      where: { readAt: null },
      data: { readAt: new Date() },
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Demand alerts</h1>
        <p className="mt-1 text-sm text-neutral-600">
          What buyers near you are ordering from other sellers in your categories. No buyer details
          — these are signals, not leads.
        </p>
      </div>

      {alerts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center">
          <p className="text-sm text-neutral-600">No demand alerts yet.</p>
          <p className="mt-1 text-xs text-neutral-500">
            You&apos;ll see one whenever a buyer in your city orders something in your category.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {alerts.map((alert) => (
            <li
              key={alert.id}
              className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-neutral-200 bg-white p-4 text-sm"
            >
              <div>
                <p className="font-medium">{alert.productName}</p>
                <p className="mt-0.5 text-neutral-600">
                  {alert.quantityBand} units · {alert.location.name} · {alert.category.name}
                </p>
              </div>
              <time
                dateTime={alert.createdAt.toISOString()}
                className="text-xs text-neutral-500"
              >
                {alert.createdAt.toLocaleDateString("en-IN")}
              </time>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
