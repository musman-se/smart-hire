import { useEffect } from "react";

/**
 * Steps back to the last page when the offset points past the end: a stale link, or
 * the last rows of the last page leaving the filter (deleted, moved to another stage).
 * Otherwise the list would show its empty state while earlier pages still have rows.
 *
 * It only acts when the offset is beyond the last page, so the setter need not be
 * stable, and an empty page that is merely loading is left alone.
 *
 * Write the corrected offset over the current history entry (useUrlState's
 * `{ history: "replace" }`): pushed, Back would return to the stale offset, which
 * would be corrected forward again.
 */
export function useClampOffset(
  page: { items: readonly unknown[]; total: number } | undefined,
  offset: number,
  limit: number,
  setOffset: (offset: number) => void,
) {
  useEffect(() => {
    if (!page || page.items.length > 0 || page.total === 0) return;
    const lastPage = Math.floor((page.total - 1) / limit) * limit;
    if (offset > lastPage) setOffset(lastPage);
  }, [page, offset, limit, setOffset]);
}
