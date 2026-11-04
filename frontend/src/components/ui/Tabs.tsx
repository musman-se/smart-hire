import { useRef, type KeyboardEvent, type ReactNode } from "react";

import { cx } from "../../lib/cx";
import { formatNumber } from "../../lib/format";
import { Icon, type IconName } from "./Icon";
import { focusItem, rovingIndex } from "./roving";

export interface TabItem<V extends string> {
  value: V;
  label: ReactNode;
  /** A number badge — "Applied 12". Undefined hides it; 0 shows 0. */
  count?: number;
  icon?: IconName;
  disabled?: boolean;
}

export interface TabsProps<V extends string> {
  items: readonly TabItem<V>[];
  value: V;
  onChange: (value: V) => void;
  /** Names the tab list for screen readers: "Application stages". */
  "aria-label": string;
  /** Set it to connect the tabs to a <TabPanel tabsId={id}>. */
  id?: string;
  className?: string;
}

/**
 * A tab list with roving focus: one Tab stop for the whole row, arrows (and Home/End)
 * move between tabs, and moving selects — the "automatic activation" pattern, right
 * for tabs whose panels render instantly.
 *
 * Tabs that filter a list (stage tabs over a table) need no TabPanel; tabs that swap
 * whole sections should render one, so the panel is labelled by its tab.
 */
export function Tabs<V extends string>({
  items,
  value,
  onChange,
  id,
  className,
  ...aria
}: TabsProps<V>) {
  const listRef = useRef<HTMLDivElement>(null);
  const enabled = items.filter((item) => !item.disabled);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = enabled.findIndex((item) => item.value === value);
    const next = rovingIndex(event.key, current, enabled.length);
    const target = next === null ? undefined : enabled[next];
    if (!target) return;
    event.preventDefault();
    onChange(target.value);
    focusItem(listRef.current, target.value);
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={aria["aria-label"]}
      className={cx("tabs", className)}
      onKeyDown={handleKeyDown}
    >
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            id={id ? `${id}-tab-${item.value}` : undefined}
            aria-selected={selected}
            aria-controls={id ? `${id}-panel` : undefined}
            tabIndex={selected ? 0 : -1}
            disabled={item.disabled}
            data-value={item.value}
            className="tab"
            onClick={() => onChange(item.value)}
          >
            {item.icon && <Icon name={item.icon} />}
            {item.label}
            {item.count !== undefined && (
              <span className="tab-count">{formatNumber(item.count)}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export interface TabPanelProps {
  /** The `id` given to <Tabs>. */
  tabsId: string;
  /** The selected tab's value — the panel is labelled by that tab. */
  value: string;
  children: ReactNode;
  className?: string;
}

export function TabPanel({ tabsId, value, children, className }: TabPanelProps) {
  return (
    <div
      role="tabpanel"
      id={`${tabsId}-panel`}
      aria-labelledby={`${tabsId}-tab-${value}`}
      tabIndex={0}
      className={cx("tab-panel", className)}
    >
      {children}
    </div>
  );
}
