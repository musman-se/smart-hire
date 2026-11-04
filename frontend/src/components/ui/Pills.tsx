import type { ApplicationStage, JobStatus } from "../../api/types";
import { cx } from "../../lib/cx";
import { humanize } from "../../lib/format";
import { Icon } from "./Icon";

/*
 * Status and stage pills. Each value's colour is a token pair in tokens.css
 * (--status-*, --stage-*): one place to change what "published" or "offer" looks like.
 */

export function StatusPill({ status, className }: { status: JobStatus; className?: string }) {
  return (
    <span className={cx("pill", `pill-${status}`, className)}>
      <span className="pill-dot" aria-hidden="true" />
      {humanize(status)}
    </span>
  );
}

export function StagePill({ stage, className }: { stage: ApplicationStage; className?: string }) {
  return (
    <span className={cx("pill", `pill-${stage}`, className)}>
      <span className="pill-dot" aria-hidden="true" />
      {humanize(stage)}
    </span>
  );
}

export interface TagsProps {
  items: readonly string[];
  /** Items to mark as matched, compared case-insensitively. */
  highlight?: readonly string[];
  /** Show at most this many, then "+N" (the rest in its tooltip and its accessible text). */
  max?: number;
  className?: string;
}

/**
 * Skill chips. An empty list renders an em dash, so table cells never look broken.
 * A match is marked by a check and in words as well as by colour, so it does not rely
 * on telling teal from grey.
 */
export function Tags({ items, highlight, max, className }: TagsProps) {
  if (items.length === 0) return <span className="muted">—</span>;

  const matched = new Set((highlight ?? []).map((item) => item.toLowerCase()));
  const shown = max === undefined ? items : items.slice(0, max);
  const hidden = items.slice(shown.length);

  return (
    <span className={cx("tag-list", className)}>
      {shown.map((item) =>
        matched.has(item.toLowerCase()) ? (
          <span key={item} className="tag match">
            <Icon name="check" size={12} />
            {item}
            <span className="sr-only"> (matched)</span>
          </span>
        ) : (
          <span key={item} className="tag">
            {item}
          </span>
        ),
      )}
      {hidden.length > 0 && (
        // `title` serves the mouse; the names are spelled out for screen readers too.
        <span className="tag-more" title={hidden.join(", ")}>
          <span aria-hidden="true">+{hidden.length}</span>
          <span className="sr-only">{`and ${hidden.length} more: ${hidden.join(", ")}`}</span>
        </span>
      )}
    </span>
  );
}
