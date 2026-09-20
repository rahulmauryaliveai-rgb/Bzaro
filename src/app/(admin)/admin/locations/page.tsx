import { requirePermission } from "@/lib/auth/guards";
import { listLocationTree, type AdminLocation } from "@/server/services/admin-taxonomy.service";
import { createLocationAction, updateLocationAction } from "@/server/actions/admin-taxonomy";

/**
 * Locations: country → states → cities. Cities are what sellers register
 * in and buyers filter by; `clusterKey` groups a metro (e.g. "ncr") for the
 * lead matcher's city tier (docs/LEADS.md §3).
 */
export default async function AdminLocationsPage() {
  await requirePermission("admin:taxonomy:manage");
  const tree = await listLocationTree();
  const country = tree[0];
  const states = country?.children ?? [];
  const cityCount = states.reduce((n, state) => n + state.children.length, 0);

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight">Locations</h1>
      <p className="mt-1 text-sm text-neutral-400">
        {states.length} states · {cityCount} cities. Deactivating a city hides it from pickers and
        listings; sellers already in it keep their address.
      </p>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-neutral-700 bg-neutral-800 p-5">
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-neutral-400 uppercase">
            New state
          </h2>
          <form action={createLocationAction} className="flex flex-wrap items-end gap-2 text-sm">
            <input type="hidden" name="type" value="STATE" />
            {country ? <input type="hidden" name="parentId" value={country.id} /> : null}
            <label className="flex flex-col gap-1">
              <span className="text-xs text-neutral-500">Name</span>
              <input name="name" required minLength={2} maxLength={80} className={input} />
            </label>
            <button type="submit" className={primary}>
              Add state
            </button>
          </form>
        </div>
        <div className="rounded-lg border border-neutral-700 bg-neutral-800 p-5">
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-neutral-400 uppercase">
            New city
          </h2>
          <form action={createLocationAction} className="flex flex-wrap items-end gap-2 text-sm">
            <input type="hidden" name="type" value="CITY" />
            <label className="flex flex-col gap-1">
              <span className="text-xs text-neutral-500">State</span>
              <select name="parentId" required className={input}>
                <option value="">Choose…</option>
                {states.map((state) => (
                  <option key={state.id} value={state.id}>
                    {state.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-neutral-500">City</span>
              <input name="name" required minLength={2} maxLength={80} className={input} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-neutral-500">Cluster (optional)</span>
              <input
                name="clusterKey"
                placeholder="ncr"
                maxLength={40}
                className={`${input} w-24`}
              />
            </label>
            <button type="submit" className={primary}>
              Add city
            </button>
          </form>
        </div>
      </section>

      <ul className="mt-6 space-y-3">
        {states.map((state) => (
          <li key={state.id}>
            <details className="group rounded-lg border border-neutral-700 bg-neutral-800">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
                <span className="text-neutral-500 group-open:rotate-90">▸</span>
                <span className={`font-medium ${state.isActive ? "" : "line-through opacity-50"}`}>
                  {state.name}
                </span>
                <span className="text-xs text-neutral-500">
                  {state.children.length} cities · {state.sellerCount} sellers
                </span>
              </summary>
              <div className="border-t border-neutral-700 px-4 py-3">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs tracking-wide text-neutral-500 uppercase">
                    <tr>
                      <th className="py-1.5 pr-3">City</th>
                      <th className="py-1.5 pr-3">Cluster</th>
                      <th className="py-1.5 pr-3">Sellers</th>
                      <th className="py-1.5 pr-3">Path</th>
                      <th className="py-1.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {state.children.map((city) => (
                      <CityRow key={city.id} city={city} />
                    ))}
                    {state.children.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-3 text-neutral-500">
                          No cities yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CityRow({ city }: { city: AdminLocation }) {
  const formId = `city-${city.id}`;
  return (
    <tr className="border-t border-neutral-700/60">
      <td className="py-2 pr-3">
        <form id={formId} action={updateLocationAction}>
          <input type="hidden" name="id" value={city.id} />
          <input
            name="name"
            defaultValue={city.name}
            required
            minLength={2}
            maxLength={80}
            className={`${input} ${city.isActive ? "" : "line-through opacity-60"}`}
          />
        </form>
      </td>
      <td className="py-2 pr-3">
        <input
          form={formId}
          name="clusterKey"
          defaultValue={city.clusterKey ?? ""}
          maxLength={40}
          className={`${input} w-24`}
        />
      </td>
      <td className="py-2 pr-3 text-neutral-300 tabular-nums">{city.sellerCount}</td>
      <td className="py-2 pr-3 font-mono text-xs text-neutral-500">{city.path}</td>
      <td className="py-2 text-right whitespace-nowrap">
        <button form={formId} type="submit" className={secondary}>
          Save
        </button>{" "}
        <form action={updateLocationAction} className="inline">
          <input type="hidden" name="id" value={city.id} />
          <input type="hidden" name="isActive" value={city.isActive ? "0" : "1"} />
          <button type="submit" className={city.isActive ? danger : secondary}>
            {city.isActive ? "Deactivate" : "Activate"}
          </button>
        </form>
      </td>
    </tr>
  );
}

const input = "rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-neutral-100";
const primary = "rounded-md bg-white px-3 py-1.5 font-medium text-neutral-900 hover:bg-neutral-200";
const secondary = "rounded-md border border-neutral-600 px-3 py-1.5 hover:bg-neutral-700";
const danger = "rounded-md border border-red-900 px-3 py-1.5 text-red-300 hover:bg-red-950";
