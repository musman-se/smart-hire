import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { cx } from "../../lib/cx";
import { Icon } from "./Icon";

export interface BreadcrumbItem {
  label: ReactNode;
  /** Omit on the last item: it is the current page. */
  to?: string;
}

export function Breadcrumbs({ items, className }: { items: readonly BreadcrumbItem[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cx("breadcrumbs", className)}>
      <ol>
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={index}>
              {item.to && !last ? (
                <Link to={item.to}>{item.label}</Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className="truncate">
                  {item.label}
                </span>
              )}
              {!last && <Icon name="chevron-right" size={12} className="breadcrumbs-sep" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
