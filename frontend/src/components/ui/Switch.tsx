import type { ReactNode } from "react";

import { cx } from "../../lib/cx";

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Visible label; without one, pass aria-label. */
  label?: ReactNode;
  "aria-label"?: string;
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
}

/**
 * An on/off toggle that takes effect immediately — for a setting, not a form field
 * that is submitted later (use Checkbox for that).
 */
export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  id,
  className,
  ...aria
}: SwitchProps) {
  const control = (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={aria["aria-label"]}
      disabled={disabled}
      className="switch"
      onClick={() => onCheckedChange(!checked)}
    >
      <span className="switch-thumb" aria-hidden="true" />
    </button>
  );
  if (label === undefined) return control;

  // A <label> around a button names it, and clicking the text toggles it.
  return (
    <label className={cx("switch-field", className)}>
      {control}
      <span>
        {label}
        {description && <span className="checkbox-description">{description}</span>}
      </span>
    </label>
  );
}
