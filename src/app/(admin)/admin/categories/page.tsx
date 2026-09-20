import { requirePermission } from "@/lib/auth/guards";
import { listCategoryTree, type AdminCategory } from "@/server/services/admin-taxonomy.service";
import {
  createCategoryAction,
  toggleCategoryAction,
  updateCategoryAction,
} from "@/server/actions/admin-taxonomy";

/**
 * Category tree (D34). Groups expand to their subcategories; every node can
 * be renamed, given an image, deactivated, or given a child. Nothing is
 * deleted — products and sellers keep referencing what they chose.
 */
export default async function AdminCategoriesPage() {
  await requirePermission("admin:taxonomy:manage");
  const tree = await listCategoryTree();
  const total = countNodes(tree);

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
      <p className="mt-1 text-sm text-neutral-400">
        {tree.length} groups · {total} categories. Sellers pick these at registration; the lead
        matcher and every category page key on them.
      </p>

      <section className="mt-6 rounded-lg border border-neutral-700 bg-neutral-800 p-5">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-neutral-400 uppercase">
          New group
        </h2>
        <form action={createCategoryAction} className="flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-neutral-500">Name</span>
            <input name="name" required minLength={2} maxLength={80} className={input} />
          </label>
          <button type="submit" className={primary}>
            Add group
          </button>
        </form>
      </section>

      <ul className="mt-6 space-y-3">
        {tree.map((group) => (
          <li key={group.id}>
            <details className="group rounded-lg border border-neutral-700 bg-neutral-800">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
                <span className="text-neutral-500 group-open:rotate-90">▸</span>
                <span className={`font-medium ${group.isActive ? "" : "line-through opacity-50"}`}>
                  {group.name}
                </span>
                <span className="text-xs text-neutral-500">
                  {group.children.length} sub · {group.sellerCount} sellers · {group.productCount}{" "}
                  products
                </span>
                <span className="ml-auto font-mono text-xs text-neutral-600">{group.path}</span>
              </summary>
              <div className="border-t border-neutral-700 px-4 py-4">
                <NodeEditor node={group} />
                <ul className="mt-4 divide-y divide-neutral-700/60 border-t border-neutral-700/60">
                  {group.children.map((sub) => (
                    <li key={sub.id} className="py-3">
                      <NodeEditor node={sub} compact />
                      {sub.children.length > 0 ? (
                        <ul className="mt-2 ml-6 space-y-2 border-l border-neutral-700 pl-4">
                          {sub.children.map((leaf) => (
                            <li key={leaf.id}>
                              <NodeEditor node={leaf} compact leaf />
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <form
                  action={createCategoryAction}
                  className="mt-4 flex flex-wrap items-end gap-2 text-sm"
                >
                  <input type="hidden" name="parentId" value={group.id} />
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-neutral-500">
                      New subcategory in {group.name}
                    </span>
                    <input name="name" required minLength={2} maxLength={80} className={input} />
                  </label>
                  <button type="submit" className={secondary}>
                    Add
                  </button>
                </form>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NodeEditor({
  node,
  compact = false,
  leaf = false,
}: {
  node: AdminCategory;
  compact?: boolean;
  leaf?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2 text-sm">
      <form action={updateCategoryAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="id" value={node.id} />
        <label className="flex flex-col gap-1">
          {!compact ? <span className="text-xs text-neutral-500">Group name</span> : null}
          <input
            name="name"
            defaultValue={node.name}
            required
            minLength={2}
            maxLength={80}
            className={`${input} ${node.isActive ? "" : "line-through opacity-60"}`}
          />
        </label>
        {!leaf ? (
          <label className="flex flex-col gap-1">
            {!compact ? <span className="text-xs text-neutral-500">Image URL (tile)</span> : null}
            <input
              name="imageUrl"
              defaultValue={node.imageUrl ?? ""}
              placeholder="https://…"
              className={`${input} w-56`}
            />
          </label>
        ) : null}
        <label className="flex flex-col gap-1">
          {!compact ? <span className="text-xs text-neutral-500">Order</span> : null}
          <input
            name="sortOrder"
            type="number"
            min={0}
            defaultValue={node.sortOrder}
            className={`${input} w-16`}
          />
        </label>
        <button type="submit" className={secondary}>
          Save
        </button>
      </form>
      <form action={toggleCategoryAction}>
        <input type="hidden" name="id" value={node.id} />
        <input type="hidden" name="isActive" value={node.isActive ? "0" : "1"} />
        <button type="submit" className={node.isActive ? danger : secondary}>
          {node.isActive ? "Deactivate" : "Activate"}
        </button>
      </form>
      <span className="text-xs text-neutral-500">
        {node.sellerCount}s · {node.productCount}p
      </span>
      {compact && !leaf && node.depth === 1 ? (
        <form action={createCategoryAction} className="ml-auto flex items-end gap-2">
          <input type="hidden" name="parentId" value={node.id} />
          <input
            name="name"
            placeholder="Add specialisation…"
            required
            minLength={2}
            maxLength={80}
            className={`${input} w-44`}
          />
          <button type="submit" className={secondary}>
            Add
          </button>
        </form>
      ) : null}
    </div>
  );
}

function countNodes(nodes: AdminCategory[]): number {
  return nodes.reduce((n, node) => n + 1 + countNodes(node.children), 0);
}

const input = "rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-neutral-100";
const primary = "rounded-md bg-white px-3 py-1.5 font-medium text-neutral-900 hover:bg-neutral-200";
const secondary = "rounded-md border border-neutral-600 px-3 py-1.5 hover:bg-neutral-700";
const danger = "rounded-md border border-red-900 px-3 py-1.5 text-red-300 hover:bg-red-950";
