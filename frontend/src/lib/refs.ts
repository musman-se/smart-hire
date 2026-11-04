import type { Ref } from "react";

/** Points a ref the caller passed at a node, whichever kind of ref it is — for
 * components that also need the node themselves. */
export function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}
