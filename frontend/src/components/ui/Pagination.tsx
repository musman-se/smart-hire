import { useId } from "react";

import { formatNumber } from "../../lib/format";
import { IconButton } from "./Button";

export interface PaginationProps {
  total: number;
  limit: number;
  offset: number;
  onChange: (offset: number) => void;
  /** Offer a page-size picker with these sizes (the API caps a page at 100). */
  pageSizeOptions?: readonly number[];
  /** Required with pageSizeOptions. Pagination resets to the first page itself. */
  onLimitChange?: (limit: number) => void;
  /** Hide the numbered pages, keeping "x–y of z" and prev/next. */
  compact?: boolean;
  /** What is being counted: "jobs" makes it "1–20 of 54 jobs". */
  noun?: string;
}

type PageItem = number | "gap";

/** Page numbers to show: always the first and last, a window around the current one,
 * and a gap where pages are skipped. 1-based. */
export function pageItems(current: number, pageCount: number, radius = 1): PageItem[] {
  const pages = new Set([1, pageCount]);
  for (let page = current - radius; page <= current + radius; page++) {
    if (page >= 1 && page <= pageCount) pages.add(page);
  }
  const sorted = [...pages].filter((page) => page >= 1).sort((a, b) => a - b);

  const items: PageItem[] = [];
  sorted.forEach((page, index) => {
    const previous = sorted[index - 1];
    if (previous !== undefined && page - previous > 1) {
      // A gap of exactly one page shows that page instead of an ellipsis.
      items.push(page - previous === 2 ? previous + 1 : "gap");
    }
    items.push(page);
  });
  return items;
}

/** Offset-based pagination over the API's {items, total, limit, offset} envelope. */
export function Pagination({
  total,
  limit,
  offset,
  onChange,
  pageSizeOptions,
  onLimitChange,
  compact = false,
  noun,
}: PaginationProps) {
  const sizeId = useId();
  const pageCount = Math.max(1, Math.ceil(total / limit));
  const current = Math.floor(offset / limit) + 1;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, total);

  const goTo = (page: number) => onChange((page - 1) * limit);

  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="pagination-info">
        {formatNumber(from)}–{formatNumber(to)} of {formatNumber(total)}
        {noun ? ` ${noun}` : ""}
      </span>

      {pageSizeOptions && onLimitChange && (
        <span className="pagination-size">
          <label htmlFor={sizeId}>Rows</label>
          <select
            id={sizeId}
            value={limit}
            onChange={(event) => {
              onLimitChange(Number(event.target.value));
              onChange(0);
            }}
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </span>
      )}

      <span className="spacer" />

      <IconButton
        icon="chevron-left"
        size="sm"
        aria-label="Previous page"
        disabled={offset === 0}
        onClick={() => onChange(Math.max(0, offset - limit))}
      />
      {!compact && pageCount > 1 && (
        <span className="pagination-pages">
          {pageItems(current, pageCount).map((item, index) =>
            item === "gap" ? (
              <span key={`gap-${index}`} className="pagination-ellipsis" aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                className="pagination-page"
                aria-label={`Page ${item}`}
                aria-current={item === current ? "page" : undefined}
                onClick={() => goTo(item)}
              >
                {item}
              </button>
            ),
          )}
        </span>
      )}
      <IconButton
        icon="chevron-right"
        size="sm"
        aria-label="Next page"
        disabled={offset + limit >= total}
        onClick={() => onChange(offset + limit)}
      />
    </nav>
  );
}
