import type { CSSProperties } from "react";

import { cx } from "../../lib/cx";

export interface SkeletonProps {
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
  circle?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * A shimmering placeholder shaped like the content it stands in for. Skeletons are
 * decorative (aria-hidden): the loading region says so itself, with aria-busy and a
 * visually hidden "Loading…".
 */
export function Skeleton({ width, height, circle, className, style }: SkeletonProps) {
  return (
    <span
      className={cx("skeleton", circle && "skeleton-circle", className)}
      style={{ width, height: height ?? (circle ? width : undefined), ...style }}
      aria-hidden="true"
    />
  );
}

/** A paragraph's worth of lines; the last is shorter, as last lines are. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <span className={cx("skeleton-text", className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} width={index === lines - 1 && lines > 1 ? "60%" : "100%"} />
      ))}
    </span>
  );
}

/** Varying widths, so a column of placeholders does not look like a barcode. */
const CELL_WIDTHS = ["70%", "45%", "85%", "55%", "65%"];

/** Placeholder rows, for inside an existing <tbody>. */
export function SkeletonRows({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, row) => (
        <tr key={row} aria-hidden="true">
          {Array.from({ length: columns }, (_, column) => (
            <td key={column}>
              <Skeleton width={CELL_WIDTHS[(row + column) % CELL_WIDTHS.length]} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** A whole placeholder table, for a region whose real table has not rendered yet. */
export function SkeletonTable({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="table-wrap" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <table className="skeleton-table">
        <tbody>
          <SkeletonRows rows={rows} columns={columns} />
        </tbody>
      </table>
    </div>
  );
}

/** The Suspense fallback for a lazy page: a header and a card, roughly where the real
 * ones will land, so the page does not jump when it arrives. */
export function PageSkeleton() {
  return (
    <div aria-busy="true">
      <span className="sr-only">Loading page…</span>
      <div className="page-header">
        <Skeleton width="14rem" height="1.75rem" />
        <Skeleton width="24rem" style={{ maxWidth: "100%" }} />
      </div>
      <div className="card">
        <SkeletonText lines={4} />
      </div>
    </div>
  );
}
