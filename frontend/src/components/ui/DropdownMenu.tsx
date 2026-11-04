import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";

import { cx } from "../../lib/cx";
import { Icon, type IconName } from "./Icon";
import { rovingIndex } from "./roving";

export type MenuEntry =
  | {
      type?: "item";
      label: ReactNode;
      icon?: IconName;
      /** Runs on click or Enter; the menu closes first. */
      onSelect?: () => void;
      /** A router path: the item renders as a link (middle-click works). */
      to?: string;
      /** Right-aligned hint — a shortcut, a count. */
      hint?: ReactNode;
      danger?: boolean;
      disabled?: boolean;
      /** Marks a radio-like choice (a theme picker): rendered with a check. */
      checked?: boolean;
    }
  | { type: "separator" }
  | { type: "label"; label: ReactNode };

type MenuItemEntry = Extract<MenuEntry, { label: ReactNode; type?: "item" }>;

/** Spread these onto the trigger element — they wire it to the menu. */
export interface MenuTriggerProps {
  ref: Ref<HTMLButtonElement>;
  id: string;
  "aria-haspopup": "menu";
  "aria-expanded": boolean;
  "aria-controls": string;
  onClick: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

export interface DropdownMenuProps {
  /** Renders the trigger: `(props) => <IconButton {...props} icon="more-horizontal"
   * aria-label="Job actions" />`. Any button works, as long as it takes the props. */
  trigger: (props: MenuTriggerProps) => ReactNode;
  items: readonly MenuEntry[];
  /** Which edge of the trigger the menu lines up with. */
  align?: "start" | "end";
  /** The preferred side; the menu flips when that side has no room. */
  side?: "bottom" | "top";
  /** Accessible name; defaults to the trigger's. */
  "aria-label"?: string;
  className?: string;
}

function isItem(entry: MenuEntry): entry is MenuItemEntry {
  return entry.type === undefined || entry.type === "item";
}

/** The gap between trigger and menu, and the menu's least distance from the viewport edge. */
const GAP = 4;
const EDGE = 8;

/**
 * Places the fixed-position menu against its trigger: on the preferred side when it
 * fits, flipped when only the other side does, and nudged to stay inside the viewport.
 */
function placeMenu(
  menu: HTMLElement,
  trigger: HTMLElement,
  { align, side }: { align: "start" | "end"; side: "bottom" | "top" },
) {
  const anchor = trigger.getBoundingClientRect();
  const { offsetWidth: width, offsetHeight: height } = menu;
  const fitsBelow = anchor.bottom + GAP + height <= window.innerHeight - EDGE;
  const fitsAbove = anchor.top - GAP - height >= EDGE;
  const above = side === "top" ? fitsAbove || !fitsBelow : !fitsBelow && fitsAbove;

  const preferredLeft = align === "end" ? anchor.right - width : anchor.left;
  const left = Math.min(Math.max(preferredLeft, EDGE), window.innerWidth - width - EDGE);
  menu.style.top = `${above ? anchor.top - GAP - height : anchor.bottom + GAP}px`;
  menu.style.left = `${Math.max(left, EDGE)}px`;
}

/**
 * A button that opens a list of actions (the ARIA menu-button pattern). Arrow keys
 * move, Home/End jump, Enter selects, Escape closes and returns focus to the trigger;
 * a click outside or Tab away also closes.
 *
 * The menu renders in a portal, so a row menu inside a flush card or a scrolling
 * table is never clipped. React still bubbles its events through the trigger's tree.
 */
export function DropdownMenu({
  trigger,
  items,
  align = "start",
  side = "bottom",
  className,
  ...aria
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerId = useId();
  const menuId = useId();

  const selectable = items.filter(isItem).filter((item) => !item.disabled);

  function openMenu(focus: "first" | "last") {
    setActive(focus === "first" ? 0 : selectable.length - 1);
    setOpen(true);
  }

  function close({ restoreFocus }: { restoreFocus: boolean }) {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  // Focus follows the active item while open.
  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelectorAll<HTMLElement>("[data-menu-index]")[active]?.focus();
  }, [open, active]);

  // Placed before paint, and again whenever anything scrolls or the window resizes.
  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      if (menuRef.current && triggerRef.current) {
        placeMenu(menuRef.current, triggerRef.current, { align, side });
      }
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, align, side]);

  // A press anywhere outside closes, without stealing focus from where it went.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openMenu("first");
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openMenu("last");
    }
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      // Stops here: an Escape that closes this menu must not also close a dialog.
      event.preventDefault();
      event.stopPropagation();
      close({ restoreFocus: true });
      return;
    }
    if (event.key === "Tab") {
      // Back on the trigger first, so Tab moves on from there rather than from the
      // portal at the end of <body>.
      close({ restoreFocus: true });
      return;
    }
    const next = rovingIndex(event.key, active, selectable.length, "vertical");
    if (next !== null) {
      event.preventDefault();
      setActive(next);
    }
  }

  function select(item: MenuItemEntry) {
    close({ restoreFocus: !item.to });
    item.onSelect?.();
  }

  let selectableIndex = -1;

  return (
    <div ref={rootRef} className={cx("dropdown", className)}>
      {trigger({
        ref: triggerRef,
        id: triggerId,
        "aria-haspopup": "menu",
        "aria-expanded": open,
        "aria-controls": menuId,
        onClick: () => (open ? close({ restoreFocus: false }) : openMenu("first")),
        onKeyDown: handleTriggerKeyDown,
      })}

      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={aria["aria-label"]}
            aria-labelledby={aria["aria-label"] ? undefined : triggerId}
            className="menu"
            onKeyDown={handleMenuKeyDown}
          >
            {items.map((entry, index) => {
              if (entry.type === "separator") {
                return <div key={index} role="separator" className="menu-separator" />;
              }
              if (entry.type === "label") {
                return (
                  <div key={index} className="menu-label" role="presentation">
                    {entry.label}
                  </div>
                );
              }

              const position = entry.disabled ? -1 : ++selectableIndex;
              const content = (
                <>
                  {entry.icon && <Icon name={entry.icon} />}
                  <span className="menu-item-label">{entry.label}</span>
                  {entry.hint && <span className="menu-item-hint">{entry.hint}</span>}
                  {entry.checked && <Icon name="check" className="menu-item-hint" />}
                </>
              );
              const shared = {
                role: entry.checked === undefined ? "menuitem" : "menuitemradio",
                "aria-checked": entry.checked,
                tabIndex: -1,
                "data-menu-index": entry.disabled ? undefined : position,
                className: cx("menu-item", entry.danger && "menu-item-danger"),
                onMouseEnter: entry.disabled ? undefined : () => setActive(position),
              };

              return entry.to && !entry.disabled ? (
                <Link key={index} to={entry.to} {...shared} onClick={() => select(entry)}>
                  {content}
                </Link>
              ) : (
                <button
                  key={index}
                  type="button"
                  disabled={entry.disabled}
                  {...shared}
                  onClick={() => select(entry)}
                >
                  {content}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
