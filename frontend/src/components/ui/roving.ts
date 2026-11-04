export type Orientation = "horizontal" | "vertical" | "both";

/**
 * Where arrow-key navigation lands in a row of `count` items, wrapping at the ends;
 * null for a key that does not navigate. Home and End jump to the ends. Shared by the
 * composite widgets (tabs, segmented control, menus, palette) so they all move alike.
 */
export function rovingIndex(
  key: string,
  current: number,
  count: number,
  orientation: Orientation = "horizontal",
): number | null {
  if (count === 0) return null;
  const horizontal = orientation !== "vertical";
  const vertical = orientation !== "horizontal";
  const forward = (horizontal && key === "ArrowRight") || (vertical && key === "ArrowDown");
  const backward = (horizontal && key === "ArrowLeft") || (vertical && key === "ArrowUp");

  if (forward) return current >= count - 1 ? 0 : current + 1;
  if (backward) return current <= 0 ? count - 1 : current - 1;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

/** Focuses the item carrying data-value={value} inside a composite widget. Compared
 * in JS rather than by selector, so values need no CSS escaping. */
export function focusItem(container: HTMLElement | null, value: string): void {
  const items = container?.querySelectorAll<HTMLElement>("[data-value]") ?? [];
  Array.from(items)
    .find((item) => item.dataset.value === value)
    ?.focus();
}
