import { clientEnv } from "@/env.client";

export const IS_DEMO = clientEnv.NEXT_PUBLIC_DEMO_MODE === "1";

/**
 * The strip across the top of every page on the sales-demo copy of Bzaro.
 *
 * The demo exists so prospective sellers can click through a populated
 * marketplace, a storefront, the cart and a test payment. Nobody who lands on
 * it — a prospect, a search result, a forwarded link — should mistake it for
 * the real thing, so it says so on every surface, in plain words.
 *
 * Renders nothing outside demo mode, so it is safe in every root layout.
 */
export function DemoBanner() {
  if (!IS_DEMO) return null;

  return (
    <div
      role="note"
      className="w-full bg-amber-400 px-4 py-2 text-center text-sm font-medium text-neutral-900"
    >
      Demo of Bzaro — sample businesses and test payments only; nothing here is a real order.{" "}
      <a href="https://bzaro.in" className="underline underline-offset-2">
        Go to the live marketplace
      </a>
    </div>
  );
}
