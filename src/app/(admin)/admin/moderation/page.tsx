import Link from "next/link";
import { requirePermission } from "@/lib/auth/guards";
import { listModerationQueue } from "@/server/services/admin.service";
import { moderateProductAction } from "@/server/actions/admin";

/**
 * Content moderation queue (decision D10).
 *
 * Oldest first: a first-in-first-out queue bounds how long any seller waits,
 * whereas newest-first starves the backlog indefinitely.
 */
export default async function ModerationPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requirePermission("admin:content:moderate");

  const query = await searchParams;
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const queue = await listModerationQueue(page);

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">Moderation</h1>
      <p className="mt-1 text-sm text-neutral-400">
        <span className="tabular-nums">{queue.total}</span> item
        {queue.total === 1 ? "" : "s"} awaiting review
      </p>

      {queue.products.length === 0 ? (
        <p className="mt-8 rounded-lg border border-dashed border-neutral-700 p-12 text-center text-neutral-400">
          Nothing to review.
        </p>
      ) : (
        <ul className="mt-8 space-y-4">
          {queue.products.map((product) => (
            <li
              key={product.id}
              className="rounded-lg border border-neutral-700 bg-neutral-800 p-5"
            >
              <div className="flex gap-4">
                {product.images[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={product.images[0].url}
                    alt=""
                    className="h-20 w-20 shrink-0 rounded object-cover"
                    loading="lazy"
                  />
                ) : null}

                <div className="min-w-0 flex-1">
                  <p className="font-medium">{product.name}</p>
                  <Link
                    href={`/admin/sellers/${product.seller.id}`}
                    className="text-sm text-neutral-400 hover:underline"
                  >
                    {product.seller.businessName}
                  </Link>
                  {product.shortDescription ? (
                    <p className="mt-2 text-sm text-neutral-300">{product.shortDescription}</p>
                  ) : null}
                  {product.description ? (
                    <p className="mt-2 line-clamp-3 text-sm text-neutral-400">
                      {product.description}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 flex gap-2 border-t border-neutral-700 pt-3">
                <form action={moderateProductAction}>
                  <input type="hidden" name="productId" value={product.id} />
                  <input type="hidden" name="decision" value="approve" />
                  <button
                    type="submit"
                    className="rounded-md bg-teal-600 px-3 py-1.5 text-xs font-medium text-white"
                  >
                    Approve
                  </button>
                </form>

                <form action={moderateProductAction}>
                  <input type="hidden" name="productId" value={product.id} />
                  <input type="hidden" name="decision" value="reject" />
                  <button
                    type="submit"
                    className="rounded-md border border-neutral-600 px-3 py-1.5 text-xs font-medium"
                  >
                    Reject
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
