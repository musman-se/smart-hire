/**
 * Row selection that survives paging. The table reports selection as a set of ids,
 * but an export needs the rows themselves — and a row selected on page one is no
 * longer loaded once the recruiter is on page two. So the selection keeps each
 * selected row as it was when picked.
 */
export function reconcileSelection<T extends { id: string }>(
  previous: ReadonlyMap<string, T>,
  nextIds: ReadonlySet<string>,
  visibleRows: readonly T[],
): Map<string, T> {
  const visible = new Map(visibleRows.map((row) => [row.id, row]));
  const next = new Map<string, T>();
  for (const id of nextIds) {
    // Prefer the loaded copy: it is the freshest.
    const row = visible.get(id) ?? previous.get(id);
    if (row) next.set(id, row);
  }
  return next;
}

/** Selected emails, one per line — pastes cleanly into a mail client's To field. */
export function emailList(rows: Iterable<{ email: string }>): string {
  const unique = new Set<string>();
  for (const row of rows) if (row.email) unique.add(row.email);
  return [...unique].join("\n");
}
