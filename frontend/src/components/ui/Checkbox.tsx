import { useCallback, type ComponentPropsWithRef, type ReactNode } from "react";

import { cx } from "../../lib/cx";
import { assignRef } from "../../lib/refs";

export type CheckboxProps = Omit<ComponentPropsWithRef<"input">, "type"> & {
  /** Visible label. Omit only with an aria-label (a row-select box in a table). */
  label?: ReactNode;
  description?: ReactNode;
  /** The "some selected" state of a select-all box. */
  indeterminate?: boolean;
};

export function Checkbox({
  label,
  description,
  indeterminate = false,
  className,
  ref,
  disabled,
  ...rest
}: CheckboxProps) {
  // `indeterminate` exists only as a DOM property, not an attribute, so it is set on
  // the node — and re-set whenever it changes, since the callback ref is rebuilt then.
  const setNode = useCallback(
    (node: HTMLInputElement | null) => {
      if (node) node.indeterminate = indeterminate;
      assignRef(ref, node);
    },
    [indeterminate, ref],
  );

  // Without a label the input is the whole component, so it takes the className.
  const input = (
    <input
      type="checkbox"
      ref={setNode}
      disabled={disabled}
      className={label === undefined ? className : undefined}
      {...rest}
    />
  );
  if (label === undefined) return input;

  return (
    <label className={cx("checkbox", className)} data-disabled={disabled || undefined}>
      {input}
      <span>
        {label}
        {description && <span className="checkbox-description">{description}</span>}
      </span>
    </label>
  );
}
