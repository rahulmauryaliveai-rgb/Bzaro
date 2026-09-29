/**
 * Add each node's own count to itself and every ancestor.
 * `ancestorIds` is the materialised path, so this is one pass, no recursion.
 */
export function rollUp(
  nodes: ReadonlyArray<{ id: string; ancestorIds: string[] }>,
  own: ReadonlyArray<{ id: string; count: number }>,
): Map<string, number> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const totals = new Map<string, number>();
  for (const { id, count } of own) {
    const node = byId.get(id);
    if (!node) continue;
    for (const target of [id, ...node.ancestorIds]) {
      totals.set(target, (totals.get(target) ?? 0) + count);
    }
  }
  return totals;
}
