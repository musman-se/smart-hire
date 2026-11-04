import { useId, type ComponentPropsWithRef } from "react";

import { cx } from "../../lib/cx";
import { useFieldControl } from "./Field";

export type TextareaProps = ComponentPropsWithRef<"textarea"> & {
  /** Show "n / maxLength" (or just "n" without maxLength) under the box. Needs a
   * controlled `value` to count. */
  showCount?: boolean;
};

export function Textarea({ showCount, className, maxLength, ...props }: TextareaProps) {
  const counterId = useId();
  const wired = useFieldControl({
    ...props,
    "aria-describedby":
      [props["aria-describedby"], showCount ? counterId : undefined].filter(Boolean).join(" ") ||
      undefined,
  });
  const length = typeof props.value === "string" ? props.value.length : 0;

  return (
    <>
      <textarea className={cx("input", "textarea", className)} maxLength={maxLength} {...wired} />
      {showCount && (
        <span
          id={counterId}
          className="field-counter textarea-counter"
          data-over={maxLength !== undefined && length >= maxLength}
        >
          {maxLength === undefined ? length : `${length} / ${maxLength}`}
        </span>
      )}
    </>
  );
}
