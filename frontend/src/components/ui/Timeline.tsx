import type { ReactNode } from "react";

import { cx } from "../../lib/cx";
import { Icon, type IconName } from "./Icon";

export interface TimelineItem {
  id?: string;
  icon?: IconName;
  tone?: "neutral" | "accent" | "success" | "warning" | "danger" | "info";
  title: ReactNode;
  /** Usually a time: formatRelative(at), with the full date in a title attribute. */
  meta?: ReactNode;
  body?: ReactNode;
}

export interface TimelineProps {
  items: readonly TimelineItem[];
  "aria-label"?: string;
  className?: string;
}

/** A vertical list of events — stage changes, messages sent — oldest or newest first
 * as the caller orders them. */
export function Timeline({ items, className, ...aria }: TimelineProps) {
  return (
    <ol className={cx("timeline", className)} aria-label={aria["aria-label"]}>
      {items.map((item, index) => (
        <li key={item.id ?? index} className="timeline-item">
          <span className="timeline-marker" data-tone={item.tone ?? "neutral"} aria-hidden="true">
            <Icon name={item.icon ?? "circle"} size={14} />
          </span>
          <div className="timeline-content">
            <div className="timeline-title">{item.title}</div>
            {item.meta && <div className="timeline-meta">{item.meta}</div>}
            {item.body && <div className="timeline-body">{item.body}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}
