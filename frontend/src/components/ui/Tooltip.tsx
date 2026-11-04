import {
  cloneElement,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";

export interface TooltipProps {
  content: ReactNode;
  /** "right" is for anchors inside scrolling or clipped containers (the collapsed
   * sidebar): the tip is placed against the viewport, so no ancestor can cut it off. */
  side?: "top" | "bottom" | "right";
  /** One focusable element (a button, a link). It gets aria-describedby, so the tip
   * is read as its description. */
  children: ReactElement<HTMLAttributes<HTMLElement>>;
}

/** The least space kept between a tooltip and the edge of the viewport. */
const VIEWPORT_MARGIN = 8;

/**
 * A short label shown on hover and on keyboard focus — never the only place
 * important information lives, since touch screens have no hover.
 */
export function Tooltip({ content, side = "top", children }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);

  // Centred on its anchor, a tip near the viewport's edge would overflow it and add a
  // scrollbar; it is nudged back inside before it paints. A "right" tip is fixed, so
  // it is pinned beside the anchor's on-screen box instead.
  useLayoutEffect(() => {
    const tip = tipRef.current;
    const anchor = anchorRef.current;
    if (!open || !tip || !anchor) return;
    if (side === "right") {
      const { right, top, height } = anchor.getBoundingClientRect();
      tip.style.setProperty("--tooltip-x", `${right}px`);
      tip.style.setProperty("--tooltip-y", `${top + height / 2}px`);
      return;
    }
    tip.style.setProperty("--tooltip-shift", "0px");
    const { left, right } = tip.getBoundingClientRect();
    const overflowLeft = Math.max(VIEWPORT_MARGIN - left, 0);
    const overflowRight = Math.max(right - (window.innerWidth - VIEWPORT_MARGIN), 0);
    const shift = overflowLeft - overflowRight;
    tip.style.setProperty("--tooltip-shift", `${shift}px`);
  }, [open, content, side]);

  const describedBy = [children.props["aria-describedby"], id].filter(Boolean).join(" ");

  return (
    <span
      ref={anchorRef}
      className="tooltip-anchor"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setOpen(false);
        }
      }}
    >
      {cloneElement(children, { "aria-describedby": describedBy })}
      {/* Always in the DOM so aria-describedby resolves; hidden until shown. */}
      <span ref={tipRef} role="tooltip" id={id} className="tooltip" data-side={side} hidden={!open}>
        {content}
      </span>
    </span>
  );
}
