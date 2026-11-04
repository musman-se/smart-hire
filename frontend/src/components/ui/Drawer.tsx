import { useId, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

import { cx } from "../../lib/cx";
import { IconButton } from "./Button";
import { useOverlay } from "./useOverlay";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  /** Extra controls in the header, before the close button (prev/next, a menu). */
  headerActions?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  initialFocus?: RefObject<HTMLElement | null>;
  /** What the drawer is showing, such as an application id. When it changes (the
   * drawer stepping through a list), the body starts again from the top. */
  contentKey?: string;
  className?: string;
}

/**
 * A side sheet from the right — for detail that should not cost the user their place
 * in a list (an application opened from the pipeline). Same accessibility as Modal.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  size = "md",
  headerActions,
  footer,
  children,
  initialFocus,
  contentKey,
  className,
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useOverlay(panelRef, { open, onClose, initialFocus });

  // Before paint, so the next item never flashes at the previous one's scroll position.
  useLayoutEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [contentKey]);

  if (!open) return null;

  return createPortal(
    <>
      <div className="drawer-backdrop" onMouseDown={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        className={cx("drawer", size !== "md" && `drawer-${size}`, className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <div className="drawer-header">
          <div className="modal-header-text">
            <h2 id={titleId} className="modal-title">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="modal-description">
                {description}
              </p>
            )}
          </div>
          {headerActions}
          <IconButton icon="x" size="sm" aria-label="Close" onClick={onClose} />
        </div>
        <div ref={bodyRef} className="drawer-body">
          {children}
        </div>
        {footer && <div className="drawer-footer">{footer}</div>}
      </div>
    </>,
    document.body,
  );
}
