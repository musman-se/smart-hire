import { useMemo, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";

import { cx } from "../../lib/cx";
import { Button } from "./Button";
import { Checkbox } from "./Checkbox";
import { EmptyState } from "./EmptyState";
import { Icon } from "./Icon";
import { SkeletonRows } from "./Skeleton";

export type SortDirection = "asc" | "desc";
export interface SortState {
  key: string;
  direction: SortDirection;
}

type Sortable = string | number | boolean | Date | null | undefined;

export interface Column<T> {
  /** Unique per table; also the sort key. */
  key: string;
  header: ReactNode;
  cell: (row: T, index: number) => ReactNode;
  /** The value sorted on. Its presence makes the column sortable. */
  sortValue?: (row: T) => Sortable;
  /** Force a column with a sortValue to be unsortable (or vice versa: false hides it). */
  sortable?: boolean;
  /** The direction a first click sorts in. "desc" suits scores and dates, where the
   * top of the list is the most interesting end. Defaults to "asc". */
  firstSortDirection?: SortDirection;
  width?: CSSProperties["width"];
  align?: "left" | "center" | "right";
  className?: string;
}

export interface DataTableProps<T> {
  columns: readonly Column<T>[];
  /** Undefined while the first load is in flight. */
  rows: readonly T[] | undefined;
  getRowId: (row: T) => string;
  loading?: boolean;
  /** Placeholder rows while loading. */
  skeletonRows?: number;
  /** Shown in place of the body when there are no rows. */
  empty?: ReactNode;
  /** The load failed. With no rows to show, the body says so instead of showing
   * `empty`: "Create your first job" or "Inbox zero" would be a false all-clear. */
  error?: unknown;
  /** Offered as "Try again" in that failed state. */
  onRetry?: () => void;
  /**
   * Mouse convenience only: a row click does what its primary in-cell link or button
   * does. Keyboard and screen-reader users use that control, so every table using this
   * must have one — a focusable row would only add an unnamed Tab stop beside it.
   */
  onRowClick?: (row: T) => void;
  /** Sort on first render. Sorting is client-side: it orders the loaded page only. */
  initialSort?: SortState;
  /** Controlled sorting; pair with onSortChange. */
  sort?: SortState | null;
  onSortChange?: (sort: SortState | null) => void;
  /** Checkbox column. Pass selectedIds and onSelectionChange to use it. */
  selectable?: boolean;
  selectedIds?: ReadonlySet<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  /** Names a row for its select checkbox: "Select Senior Engineer". */
  getRowLabel?: (row: T) => string;
  /** Visually hidden caption naming the table for screen readers. */
  caption?: string;
  /** Scroll inside the table, with the header sticking, past this height. */
  maxHeight?: CSSProperties["maxHeight"];
  rowClassName?: (row: T) => string | undefined;
  className?: string;
}

/**
 * Numbers and dates numerically; strings naturally ("Job 2" < "Job 10"). Empty values
 * go last in either direction: an unscored row is not the "lowest score".
 */
export function compareValues(a: Sortable, b: Sortable, direction: SortDirection = "asc"): number {
  const aEmpty = a === null || a === undefined || a === "";
  const bEmpty = b === null || b === undefined || b === "";
  if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1;
  const order = compareFilled(a, b);
  return direction === "asc" ? order : -order;
}

function compareFilled(a: NonNullable<Sortable>, b: NonNullable<Sortable>): number {
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

/** The order DataTable shows `rows` in, for callers that step through them in that
 * order (a drawer's previous and next). */
export function sortRows<T>(
  rows: readonly T[],
  columns: readonly Column<T>[],
  sort: SortState | null | undefined,
): readonly T[] {
  const sortValue = sort && columns.find((c) => c.key === sort.key)?.sortValue;
  if (!sort || !sortValue) return rows;
  // Spread first: sort() mutates, and these rows belong to the query cache.
  return [...rows].sort((a, b) => compareValues(sortValue(a), sortValue(b), sort.direction));
}

/**
 * The sort after a click on `column`'s header: its first direction, then the other one,
 * then off. Keyed on the column's own first direction, so a table that opens sorted
 * that way (scores, best first) reverses on the first click instead of clearing.
 */
export function nextSort<T>(sort: SortState | null | undefined, column: Column<T>): SortState | null {
  const first = column.firstSortDirection ?? "asc";
  if (sort?.key !== column.key) return { key: column.key, direction: first };
  if (sort.direction !== first) return null;
  return { key: column.key, direction: first === "asc" ? "desc" : "asc" };
}

const INTERACTIVE = "a, button, input, select, textarea, label, [role='menuitem'], [role='checkbox']";

/**
 * A table over typed rows. Sorting cycles a column's first direction → the other → off
 * (back to the server's order, newest first), with aria-sort on the header. It only reorders the
 * rows it is given — say so near the table when the list is paged.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowId,
  loading = false,
  skeletonRows = 5,
  empty,
  error,
  onRetry,
  onRowClick,
  initialSort,
  sort: controlledSort,
  onSortChange,
  selectable = false,
  selectedIds,
  onSelectionChange,
  getRowLabel,
  caption,
  maxHeight,
  rowClassName,
  className,
}: DataTableProps<T>) {
  const [internalSort, setInternalSort] = useState<SortState | null>(initialSort ?? null);
  const sort = controlledSort !== undefined ? controlledSort : internalSort;

  const isSortable = (column: Column<T>) => column.sortable ?? column.sortValue !== undefined;

  const sortedRows = useMemo(() => (rows ? sortRows(rows, columns, sort) : []), [rows, sort, columns]);

  function cycleSort(column: Column<T>) {
    const next = nextSort(sort, column);
    if (controlledSort === undefined) setInternalSort(next);
    onSortChange?.(next);
  }

  const visibleIds = sortedRows.map(getRowId);
  const selected = selectedIds ?? new Set<string>();
  const selectedVisible = visibleIds.filter((id) => selected.has(id)).length;
  const allSelected = visibleIds.length > 0 && selectedVisible === visibleIds.length;

  function toggleAll() {
    const next = new Set(selected);
    for (const id of visibleIds) {
      if (allSelected) next.delete(id);
      else next.add(id);
    }
    onSelectionChange?.(next);
  }

  function toggleRow(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange?.(next);
  }

  function handleRowClick(event: MouseEvent<HTMLTableRowElement>, row: T) {
    // React bubbles clicks from portals — a row's menu, a dialog it opened — through
    // the row, though they are not in its DOM. They are never a click on the row.
    if (!event.currentTarget.contains(event.target as Node)) return;
    // A link or button inside the row does its own thing, without also opening it.
    if ((event.target as Element).closest(INTERACTIVE)) return;
    onRowClick?.(row);
  }

  const columnCount = columns.length + (selectable ? 1 : 0);
  const showSkeleton = loading && sortedRows.length === 0;

  return (
    <div
      className={cx("table-wrap", className)}
      data-scroll={maxHeight !== undefined ? "y" : undefined}
      style={maxHeight !== undefined ? { maxHeight } : undefined}
      aria-busy={loading || undefined}
    >
      <table className="data-table">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {selectable && (
              <th className="cell-select" scope="col">
                <Checkbox
                  aria-label="Select all rows"
                  checked={allSelected}
                  indeterminate={selectedVisible > 0 && !allSelected}
                  onChange={toggleAll}
                  disabled={visibleIds.length === 0}
                />
              </th>
            )}
            {columns.map((column) => {
              const active = sort?.key === column.key ? sort.direction : null;
              return (
                <th
                  key={column.key}
                  scope="col"
                  style={column.width !== undefined ? { width: column.width } : undefined}
                  data-align={column.align}
                  aria-sort={active === "asc" ? "ascending" : active === "desc" ? "descending" : undefined}
                  className={column.className}
                >
                  {isSortable(column) ? (
                    <button type="button" className="th-sort" onClick={() => cycleSort(column)}>
                      {column.header}
                      <Icon
                        name={active === "asc" ? "sort-asc" : active === "desc" ? "sort-desc" : "chevrons-up-down"}
                        size={12}
                      />
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {showSkeleton ? (
            <SkeletonRows rows={skeletonRows} columns={columnCount} />
          ) : rows === undefined && error ? (
            <tr>
              <td colSpan={columnCount} className="cell-empty">
                <EmptyState
                  compact
                  icon="alert-circle"
                  title="Couldn't load this list"
                  action={
                    onRetry && (
                      <Button size="sm" leftIcon="refresh" onClick={onRetry}>
                        Try again
                      </Button>
                    )
                  }
                />
              </td>
            </tr>
          ) : sortedRows.length === 0 ? (
            <tr>
              <td colSpan={columnCount} className="cell-empty">
                {empty ?? <EmptyState compact title="Nothing here yet" />}
              </td>
            </tr>
          ) : (
            sortedRows.map((row, index) => {
              const id = getRowId(row);
              const isSelected = selected.has(id);
              return (
                <tr
                  key={id}
                  className={rowClassName?.(row)}
                  data-selected={isSelected || undefined}
                  data-clickable={onRowClick ? true : undefined}
                  onClick={onRowClick ? (event) => handleRowClick(event, row) : undefined}
                >
                  {selectable && (
                    <td className="cell-select">
                      <Checkbox
                        aria-label={`Select ${getRowLabel?.(row) ?? "row"}`}
                        checked={isSelected}
                        onChange={() => toggleRow(id)}
                      />
                    </td>
                  )}
                  {columns.map((column) => (
                    <td key={column.key} data-align={column.align} className={column.className}>
                      {column.cell(row, index)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
