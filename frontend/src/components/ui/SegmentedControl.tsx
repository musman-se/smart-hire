import { useRef, type KeyboardEvent, type ReactNode } from "react";

import { cx } from "../../lib/cx";
import { Icon, type IconName } from "./Icon";
import { focusItem, rovingIndex } from "./roving";

export interface SegmentedOption<V extends string> {
  value: V;
  label: ReactNode;
  icon?: IconName;
  /** Required when `label` is not text (an icon-only option). */
  "aria-label"?: string;
}

export interface SegmentedControlProps<V extends string> {
  options: readonly SegmentedOption<V>[];
  value: V;
  onChange: (value: V) => void;
  "aria-label": string;
  size?: "sm" | "md";
  className?: string;
}

/**
 * A small exclusive choice shown all at once — List / Board, Light / Dark / System.
 * A radio group underneath: one Tab stop, arrows move and select.
 */
export function SegmentedControl<V extends string>({
  options,
  value,
  onChange,
  size = "md",
  className,
  ...aria
}: SegmentedControlProps<V>) {
  const groupRef = useRef<HTMLDivElement>(null);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = options.findIndex((option) => option.value === value);
    const index = rovingIndex(event.key, current, options.length, "both");
    const next = index === null ? undefined : options[index];
    if (!next) return;
    event.preventDefault();
    onChange(next.value);
    focusItem(groupRef.current, next.value);
  }

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={aria["aria-label"]}
      className={cx("segmented", size === "sm" && "segmented-sm", className)}
      onKeyDown={handleKeyDown}
    >
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={option["aria-label"]}
            tabIndex={checked ? 0 : -1}
            data-value={option.value}
            className="segmented-option"
            onClick={() => onChange(option.value)}
          >
            {option.icon && <Icon name={option.icon} size={14} />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
