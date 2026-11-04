import { useCallback, useRef, type ComponentPropsWithRef, type KeyboardEvent } from "react";

import { cx } from "../../lib/cx";
import { assignRef } from "../../lib/refs";
import { IconButton } from "./Button";
import { useFieldControl } from "./Field";
import { Icon } from "./Icon";

export type SearchInputProps = Omit<
  ComponentPropsWithRef<"input">,
  "value" | "onChange" | "type" | "size"
> & {
  value: string;
  onValueChange: (value: string) => void;
  size?: "sm" | "md" | "lg";
};

/**
 * A search box: magnifier, clear button, and Escape to clear. Debounce at the query,
 * not here — `useDebouncedValue(value)` — so typing stays instant.
 */
export function SearchInput({
  value,
  onValueChange,
  size = "md",
  className,
  onKeyDown,
  ref,
  placeholder = "Search…",
  ...props
}: SearchInputProps) {
  const inner = useRef<HTMLInputElement | null>(null);
  const wired = useFieldControl(props);
  const setNode = useCallback(
    (node: HTMLInputElement | null) => {
      inner.current = node;
      assignRef(ref, node);
    },
    [ref],
  );

  function clear() {
    onValueChange("");
    inner.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    onKeyDown?.(event);
    if (event.key === "Escape" && value) {
      // Clears instead of closing whatever dialog the box sits in.
      event.preventDefault();
      event.stopPropagation();
      onValueChange("");
    }
  }

  return (
    <div className={cx("search-input", className)}>
      <Icon name="search" className="search-input-icon" />
      <input
        ref={setNode}
        type="search"
        className={cx("input", size !== "md" && `input-${size}`)}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={handleKeyDown}
        {...wired}
      />
      {value && (
        <IconButton
          icon="x"
          size="sm"
          aria-label="Clear search"
          className="search-input-clear"
          onClick={clear}
        />
      )}
    </div>
  );
}
