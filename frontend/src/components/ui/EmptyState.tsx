import type { ReactNode } from "react";

import { cx } from "../../lib/cx";
import { Icon, type IconName } from "./Icon";

export interface EmptyStateProps {
  icon?: IconName;
  title: ReactNode;
  description?: ReactNode;
  /** Usually a Button or ButtonLink — the next step out of the empty state. */
  action?: ReactNode;
  /** Less vertical padding, for inside a card or a table. */
  compact?: boolean;
  className?: string;
}

/** What a list shows when there is nothing in it: say why, and offer the way forward. */
export function EmptyState({
  icon = "inbox",
  title,
  description,
  action,
  compact,
  className,
}: EmptyStateProps) {
  return (
    <div className={cx("empty-state", compact && "empty-state-compact", className)}>
      <span className="empty-state-icon" aria-hidden="true">
        <Icon name={icon} size={22} />
      </span>
      <p className="empty-state-title">{title}</p>
      {description && <p className="empty-state-description">{description}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}
