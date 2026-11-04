import type { ReactNode } from "react";

import { cx } from "../../lib/cx";
import { Breadcrumbs, type BreadcrumbItem } from "./Breadcrumbs";

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Primary actions, right-aligned; they wrap under the title on narrow screens. */
  actions?: ReactNode;
  breadcrumbs?: readonly BreadcrumbItem[];
  /** A row under the title for facts: status pill, location, dates. Use
   * <span className="meta-item"><Icon …/>text</span> for each. */
  meta?: ReactNode;
  /** Before the title: an Avatar for a person, an icon tile for an object. */
  leading?: ReactNode;
  className?: string;
}

/**
 * The top of every page: where you are, what this is, and what you can do here. The
 * title is the page's only <h1>. Set the tab title separately with useDocumentTitle.
 */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  meta,
  leading,
  className,
}: PageHeaderProps) {
  return (
    <header className={cx("page-header", className)}>
      {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumbs items={breadcrumbs} />}
      <div className="page-header-row">
        <div className="page-header-main">
          {leading}
          <div className="page-header-text">
            <h1 className="page-header-title">{title}</h1>
            {description && <p className="page-header-description">{description}</p>}
          </div>
        </div>
        {actions && <div className="page-header-actions">{actions}</div>}
      </div>
      {meta && <div className="page-header-meta">{meta}</div>}
    </header>
  );
}
