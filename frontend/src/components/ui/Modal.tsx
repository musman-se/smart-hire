import { useId, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

import { cx } from "../../lib/cx";
import { IconButton } from "./Button";
import { useOverlay } from "./useOverlay";

export interface ModalProps {
  /** Defaults to true, so `{show && <Modal …>}` works as well as `open={show}`. */
  open?: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  /** Action buttons, right-aligned in a bar under the body. */
  footer?: ReactNode;
  children?: ReactNode;
  /** Close on a click outside the dialog. Default true; turn off for long forms. */
  closeOnBackdrop?: boolean;
  /**
   * Whether Escape, the header's X and a click outside may close it. Default true.
   * False leaves only the dialog's own buttons — for something that must not be lost to
   * a stray key, like a link shown once or a form with unsaved input.
   */
  dismissible?: boolean;
  /** Focused on open instead of the first focusable element. */
  initialFocus?: RefObject<HTMLElement | null>;
  className?: string;
}

const ignore = () => {};

/**
 * A dialog over the page: rendered into <body>, labelled by its title, focus trapped
 * inside and returned on close, Escape closes, the page behind does not scroll.
 */
export function Modal({
  open = true,
  onClose,
  title,
  description,
  size = "md",
  footer,
  children,
  closeOnBackdrop = true,
  dismissible = true,
  initialFocus,
  className,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  // Escape still reaches the overlay stack, so an inner control or this dialog keeps
  // the key from the page behind; it just does nothing here.
  useOverlay(dialogRef, { open, onClose: dismissible ? onClose : ignore, initialFocus });

  if (!open) return null;

  return createPortal(
    <div
      className="modal-backdrop"
      // mousedown, not click: a text selection dragged out of the dialog must not close it.
      onMouseDown={(event) => {
        if (dismissible && closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={cx("modal", size !== "md" && `modal-${size}`, className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <div className="modal-header">
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
          {dismissible && <IconButton icon="x" size="sm" aria-label="Close" onClick={onClose} />}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
