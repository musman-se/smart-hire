import type { ComponentPropsWithRef } from "react";

import { cx } from "../../lib/cx";
import { useFieldControl } from "./Field";

export type InputProps = Omit<ComponentPropsWithRef<"input">, "size"> & {
  size?: "sm" | "md" | "lg";
};

/** A text input. Inside <Field> it takes its id, required and aria wiring from there. */
export function Input({ size = "md", className, ...props }: InputProps) {
  const wired = useFieldControl(props);
  return (
    <input className={cx("input", size !== "md" && `input-${size}`, className)} {...wired} />
  );
}
