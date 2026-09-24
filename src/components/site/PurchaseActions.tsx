import { canAcceptPayments } from "@/server/services/integration.service";
import { AddToCartButton } from "@/components/site/AddToCartButton";

/**
 * Decides between "Add to cart" and the enquiry path (Phase 5).
 *
 * Renders nothing unless the store can genuinely take money AND this product
 * has a real price. Everywhere else the existing contact buttons remain the
 * only call to action, which is what the "Get Quote" rule amounts to: a store
 * without payments never shows a cart.
 *
 * Async server component, so the feature check is a server query and the
 * decision never reaches the client as a toggle it could flip.
 */
export async function PurchaseActions({
  sellerId,
  product,
}: {
  sellerId: string;
  product: { id: string; priceMinor: number | null; priceOnRequest: boolean };
}) {
  if (product.priceOnRequest || product.priceMinor === null) return null;
  if (!(await canAcceptPayments(sellerId))) return null;

  return (
    <div className="w-full">
      <AddToCartButton productId={product.id} />
    </div>
  );
}
