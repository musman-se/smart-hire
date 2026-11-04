import { matchItem, type MatchRange } from "./fuzzy";

/** Group order is fixed, so muscle memory works: a result is always in the same place. */
export const PALETTE_GROUPS = [
  "Recent",
  "Actions",
  "Navigation",
  "Jobs",
  "Candidates",
  "Theme",
] as const;

export type PaletteGroup = (typeof PALETTE_GROUPS)[number];

export interface Rankable {
  group: PaletteGroup;
  label: string;
  keywords?: string;
  /** Kept whatever the query: server search results the server already matched, and
   * "see all results" links. Still highlighted where the query does match. */
  pinned?: boolean;
}

export interface Ranked<T> {
  item: T;
  ranges: MatchRange[];
}

/**
 * Filters items by the query and orders them: by group, then best match first. A blank
 * query keeps the given order, which is the curated one.
 *
 * Characters scattered in order are only a fallback: once any item holds the query as
 * unbroken runs, scattered matches are dropped. Otherwise "theme" would find a recent
 * job through letters strewn across "Platform … Lahore or Remote" in its subtitle, and
 * since Recent is the first group, Enter would open that job instead of the theme.
 */
export function rankItems<T extends Rankable>(items: readonly T[], query: string): Ranked<T>[] {
  const matched = items.flatMap((item, index) => {
    const match = matchItem(query, item.label, item.keywords);
    if (!match && !item.pinned) return [];
    return [{ item, match, index }];
  });
  const strict = matched.some(({ item, match }) => !item.pinned && match?.contiguous);
  const scored = matched
    .filter(({ item, match }) => item.pinned || !strict || match?.contiguous)
    .map(({ item, match, index }) => ({
      item,
      ranges: match?.ranges ?? [],
      score: match?.score ?? 0,
      index,
    }));

  const groupIndex = (item: T) => PALETTE_GROUPS.indexOf(item.group);
  const blank = query.trim() === "";
  scored.sort(
    (a, b) =>
      groupIndex(a.item) - groupIndex(b.item) ||
      (blank ? 0 : b.score - a.score) ||
      a.index - b.index,
  );
  return scored.map(({ item, ranges }) => ({ item, ranges }));
}
