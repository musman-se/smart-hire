import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable='true']",
].join(",");

/** Keyboard-reachable elements inside a container, in DOM order. Elements under a
 * [hidden] or [inert] ancestor are skipped; CSS-hidden ones are not detected. */
export function focusableWithin(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => element.closest("[hidden], [inert]") === null,
  );
}

/**
 * Open overlays, innermost last. Only the top one answers Escape and traps Tab, so a
 * confirm dialog opened from a drawer closes alone.
 */
const stack: symbol[] = [];

/** How many overlays hold the page's scroll; the lock lifts when the last one closes.
 * Hiding the scrollbar does not shift the page sideways: base.css reserves its gutter
 * (scrollbar-gutter: stable on html). */
let scrollLocks = 0;
let savedOverflow = "";

function lockScroll() {
  if (scrollLocks++ === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
}

function unlockScroll() {
  if (--scrollLocks === 0) document.body.style.overflow = savedOverflow;
}

export interface OverlayOptions {
  open: boolean;
  onClose: () => void;
  /** Focused on open; otherwise the first focusable element, else the container. */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Default true. The mobile nav drawer turns it off: it covers only part of the page. */
  lockScroll?: boolean;
}

/**
 * The behaviour every modal surface needs, in one place: focus moves in on open and
 * back to whatever had it on close; Tab and Shift+Tab cycle inside; Escape closes; the
 * page behind does not scroll. Used by Modal, Drawer, the command palette and the
 * mobile navigation — anything with aria-modal="true".
 */
export function useOverlay(
  containerRef: RefObject<HTMLElement | null>,
  { open, onClose, initialFocus, lockScroll: shouldLock = true }: OverlayOptions,
): void {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    if (!container) return;

    const token = Symbol("overlay");
    stack.push(token);
    const previouslyFocused = document.activeElement as HTMLElement | null;
    if (shouldLock) lockScroll();

    // preventScroll on every focus move: overlays are fixed, so there is nothing to
    // scroll into view — but mid slide-in the target sits off-screen, and a plain
    // focus() would scroll the page behind to "reveal" it.
    const target = initialFocus?.current ?? focusableWithin(container)[0] ?? container;
    target.focus({ preventScroll: true });

    function onKeyDown(event: KeyboardEvent) {
      if (stack[stack.length - 1] !== token || !container) return;

      if (event.key === "Escape") {
        // A control inside that used Escape itself (clearing a search, closing a
        // listbox) prevents default; that press is not also a close.
        if (event.defaultPrevented) return;
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key === "Tab") {
        const focusable = focusableWithin(container);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first || !last) {
          event.preventDefault();
          container.focus();
          return;
        }
        const current = document.activeElement;
        const outside = !container.contains(current);
        if (event.shiftKey && (current === first || outside)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (current === last || outside)) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      stack.splice(stack.indexOf(token), 1);
      if (shouldLock) unlockScroll();
      // Back to where the user was — unless that element is gone, or focus has
      // already moved somewhere deliberate outside the overlay.
      const active = document.activeElement;
      const focusLost = active === null || active === document.body || container.contains(active);
      if (previouslyFocused?.isConnected && focusLost) previouslyFocused.focus({ preventScroll: true });
    };
  }, [open, containerRef, initialFocus, shouldLock]);
}
