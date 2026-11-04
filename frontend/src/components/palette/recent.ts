/**
 * "Recent" in the command palette: the last few jobs and candidates the user opened,
 * from anywhere in the app. Kept in localStorage — titles only, nothing sensitive —
 * under a per-user key, so a shared browser does not show one account's history to
 * the next.
 */

import { useCallback, useMemo } from "react";

import { useLocalStorage } from "../../hooks/useLocalStorage";

export type RecentKind = "job" | "candidate";

export interface RecentItem {
  kind: RecentKind;
  id: string;
  title: string;
  subtitle?: string;
}

export const MAX_RECENT = 5;

export function recentStorageKey(userId: string): string {
  return `smarthire.palette.recent.${userId}`;
}

export function recentPath(item: Pick<RecentItem, "kind" | "id">): string {
  return item.kind === "job" ? `/jobs/${item.id}` : `/candidates/${item.id}`;
}

function sameItem(a: Pick<RecentItem, "kind" | "id">, b: Pick<RecentItem, "kind" | "id">) {
  return a.kind === b.kind && a.id === b.id;
}

/** Storage is outside our control: anything that is not a well-formed item is dropped. */
export function isRecentItem(value: unknown): value is RecentItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    (item.kind === "job" || item.kind === "candidate") &&
    typeof item.id === "string" &&
    typeof item.title === "string" &&
    (item.subtitle === undefined || typeof item.subtitle === "string")
  );
}

/**
 * Moves `item` to the front, dropping any older entry for it and anything past `max`.
 * Returns the same array when nothing would change, so re-visiting the page you are
 * already on does not rewrite storage.
 */
export function rememberItem(
  list: readonly RecentItem[],
  item: RecentItem,
  max = MAX_RECENT,
): readonly RecentItem[] {
  const first = list[0];
  const unchanged =
    first !== undefined &&
    sameItem(first, item) &&
    first.title === item.title &&
    first.subtitle === item.subtitle;
  if (unchanged) return list;
  return [item, ...list.filter((entry) => !sameItem(entry, item))].slice(0, max);
}

export function forgetItem(
  list: readonly RecentItem[],
  item: Pick<RecentItem, "kind" | "id">,
): readonly RecentItem[] {
  return list.filter((entry) => !sameItem(entry, item));
}

export interface RecentItems {
  items: readonly RecentItem[];
  remember: (item: RecentItem) => void;
  forget: (item: Pick<RecentItem, "kind" | "id">) => void;
  clear: () => void;
}

export function useRecentItems(userId: string): RecentItems {
  const [stored, setStored] = useLocalStorage<unknown>(recentStorageKey(userId), []);

  const items = useMemo(
    () => (Array.isArray(stored) ? stored.filter(isRecentItem).slice(0, MAX_RECENT) : []),
    [stored],
  );

  const update = useCallback(
    (change: (list: readonly RecentItem[]) => readonly RecentItem[]) =>
      setStored((current: unknown) => {
        const list = Array.isArray(current) ? current.filter(isRecentItem) : [];
        const next = change(list);
        return next === list ? current : next;
      }),
    [setStored],
  );

  const remember = useCallback(
    (item: RecentItem) => update((list) => rememberItem(list, item)),
    [update],
  );
  const forget = useCallback(
    (item: Pick<RecentItem, "kind" | "id">) => update((list) => forgetItem(list, item)),
    [update],
  );
  const clear = useCallback(() => update(() => []), [update]);

  return useMemo(() => ({ items, remember, forget, clear }), [items, remember, forget, clear]);
}
