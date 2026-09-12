import { requirePermission } from "@/lib/auth/guards";
import { listAuditLog } from "@/server/services/admin.service";

/**
 * Audit log.
 *
 * Currently records WRITES only. Admin reads are not yet logged — a gap noted
 * in docs/SECURITY.md (T15), and the thing that would actually catch an insider
 * bulk-exporting buyer contact data.
 */
export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requirePermission("admin:audit:read");

  const query = await searchParams;
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const log = await listAuditLog(page);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
      <p className="mt-1 text-sm text-neutral-400">
        <span className="tabular-nums">{log.total}</span> recorded actions
      </p>

      <div className="mt-6 overflow-x-auto rounded-lg border border-neutral-700">
        <table className="w-full text-sm">
          <thead className="bg-neutral-800 text-left text-xs tracking-wide text-neutral-400 uppercase">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Target</th>
            </tr>
          </thead>
          <tbody>
            {log.items.map((entry) => (
              <tr key={entry.id} className="border-t border-neutral-700">
                <td className="px-4 py-3 whitespace-nowrap text-neutral-400 tabular-nums">
                  {entry.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                </td>
                <td className="px-4 py-3">{entry.actor?.email ?? "system"}</td>
                <td className="px-4 py-3 font-mono text-xs">{entry.action}</td>
                <td className="px-4 py-3 font-mono text-xs text-neutral-500">
                  {entry.entityType
                    ? `${entry.entityType}:${entry.entityId?.slice(0, 8)}`
                    : (entry.sellerId?.slice(0, 8) ?? "—")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {log.items.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-400">Nothing logged yet.</p>
      ) : null}
    </div>
  );
}
