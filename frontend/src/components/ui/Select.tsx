import type { ComponentPropsWithRef } from "react";

import { cx } from "../../lib/cx";
import { useFieldControl } from "./Field";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export type SelectProps = Omit<ComponentPropsWithRef<"select">, "size"> & {
  /** Rendered as <option>s; or pass <option> children instead. */
  options?: readonly SelectOption[];
  /** A first, empty-valued option — "All statuses", "Any". */
  placeholder?: string;
  size?: "sm" | "md" | "lg";
};

/** A native select: the platform's own picker is the most accessible one there is. */
export function Select({ options, placeholder, size = "md", className, children, ...props }: SelectProps) {
  const wired = useFieldControl(props);
  return (
    <select className={cx("input", "select", size !== "md" && `input-${size}`, className)} {...wired}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options?.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
      {children}
    </select>
  );
}
