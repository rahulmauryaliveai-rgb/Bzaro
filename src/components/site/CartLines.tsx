"use client";

import { useActionState } from "react";
import { updateCartItemAction, type CartActionState } from "@/server/actions/cart";
import { formatMoney } from "@/lib/utils/money";

export type CartLineView = {
  itemId: string;
  name: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  imageUrl: string | null;
  priceChanged: boolean;
  currentPriceMinor: number | null;
};

export function CartLines({ lines, currency }: { lines: CartLineView[]; currency: string }) {
  return (
    <ul className="mt-6 divide-y divide-neutral-200 border-y border-neutral-200">
      {lines.map((line) => (
        <CartRow key={line.itemId} line={line} currency={currency} />
      ))}
    </ul>
  );
}

function CartRow({ line, currency }: { line: CartLineView; currency: string }) {
  const [state, action, pending] = useActionState<CartActionState, FormData>(
    updateCartItemAction,
    {},
  );

  return (
    <li className="flex gap-4 py-4">
      {line.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={line.imageUrl}
          alt=""
          className="h-16 w-16 shrink-0 rounded-md object-cover"
          width={64}
          height={64}
        />
      ) : (
        <div className="h-16 w-16 shrink-0 rounded-md bg-neutral-100" />
      )}

      <div className="flex-1">
        <p className="text-sm font-medium">{line.name}</p>
        <p className="mt-0.5 text-sm text-neutral-600">
          {formatMoney(line.unitPriceMinor, currency)} each
        </p>

        {line.priceChanged && line.currentPriceMinor !== null ? (
          <p className="mt-0.5 text-xs text-amber-700">
            Now {formatMoney(line.currentPriceMinor, currency)}
          </p>
        ) : null}

        <form action={action} className="mt-2 flex items-center gap-2">
          <input type="hidden" name="itemId" value={line.itemId} />
          <label htmlFor={`qty-${line.itemId}`} className="sr-only">
            Quantity for {line.name}
          </label>
          <input
            id={`qty-${line.itemId}`}
            name="quantity"
            type="number"
            min={0}
            max={100000}
            defaultValue={line.quantity}
            className="w-20 rounded-md border border-neutral-300 px-2 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={pending}
            className="min-h-11 rounded-md border border-neutral-300 px-3 text-sm hover:bg-neutral-50 disabled:opacity-60"
          >
            {pending ? "…" : "Update"}
          </button>
          <span className="text-xs text-neutral-500">Set 0 to remove</span>
        </form>

        {state.error ? (
          <p className="mt-1 text-xs text-red-600" role="alert">
            {state.error}
          </p>
        ) : null}
      </div>

      <div className="text-sm font-medium tabular-nums">
        {formatMoney(line.lineTotalMinor, currency)}
      </div>
    </li>
  );
}
