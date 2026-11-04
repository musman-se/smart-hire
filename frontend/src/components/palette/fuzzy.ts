/**
 * Fuzzy matching for the command palette: "gjo" finds "Go to Jobs", "new job" finds
 * "Create a job" through its keywords. Pure functions, so ranking is testable without
 * rendering anything.
 */

/** Half-open character ranges, [start, end), in the original text. */
export type MatchRange = readonly [start: number, end: number];

export interface FuzzyMatch {
  /** Higher is better. Only meaningful relative to other scores from this module. */
  score: number;
  ranges: MatchRange[];
  /** Every term was found as one unbroken run, not as characters scattered in order. */
  contiguous: boolean;
}

/** Any contiguous hit outranks any scattered one: "job" in "Jobs" beats "j…o…b". */
const SUBSTRING_BASE = 1000;
const SUBSEQUENCE_BASE = 100;
/** A term found only in the keywords counts, but less than one found in the label. */
const KEYWORD_FACTOR = 0.5;

function isWordStart(text: string, index: number): boolean {
  if (index === 0) return true;
  return !/[\p{L}\p{N}]/u.test(text.charAt(index - 1));
}

/** The first occurrence that starts a word, else the first occurrence at all. */
function findSubstring(haystack: string, needle: string): number {
  let first = -1;
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + 1)) {
    if (isWordStart(haystack, at)) return at;
    if (first === -1) first = at;
  }
  return first;
}

/** Joins adjacent indices into ranges: [0,1,2,5] → [[0,3],[5,6]]. */
function toRanges(indices: readonly number[]): MatchRange[] {
  const ranges: [number, number][] = [];
  for (const index of indices) {
    const last = ranges[ranges.length - 1];
    if (last && last[1] === index) last[1] = index + 1;
    else ranges.push([index, index + 1]);
  }
  return ranges;
}

/**
 * Matches one term (whitespace ignored) against `text`, case-insensitively.
 *
 * A contiguous hit is tried first and scores highest, more so at the start of a word
 * and earlier in the text. Otherwise the term's characters must appear in order; word
 * starts and runs of adjacent characters score, gaps cost. Returns null when the
 * characters are not all there.
 */
export function fuzzyMatch(term: string, text: string): FuzzyMatch | null {
  const needle = term.toLowerCase().replace(/\s+/g, "");
  if (!needle) return { score: 0, ranges: [], contiguous: true };
  const haystack = text.toLowerCase();

  const at = findSubstring(haystack, needle);
  if (at !== -1) {
    const score =
      SUBSTRING_BASE +
      (isWordStart(haystack, at) ? 200 : 0) +
      (at === 0 ? 100 : 0) -
      at -
      // Among equal hits, the shorter text is the closer match.
      (haystack.length - needle.length) / 10;
    return { score, ranges: [[at, at + needle.length]], contiguous: true };
  }

  const indices: number[] = [];
  let score = SUBSEQUENCE_BASE;
  let from = 0;
  for (const char of needle) {
    const index = haystack.indexOf(char, from);
    if (index === -1) return null;
    const previous = indices[indices.length - 1];
    if (previous !== undefined && index === previous + 1) score += 15;
    else if (isWordStart(haystack, index)) score += 10;
    else score -= Math.min(index - from, 10);
    indices.push(index);
    from = index + 1;
  }
  return { score, ranges: toRanges(indices), contiguous: false };
}

/**
 * Matches a whole query against an item: every whitespace-separated term must be found
 * in the label or in the keywords. The label wins unless only the keywords hold the
 * term as one unbroken run. Only label hits are returned as ranges, since only the
 * label is drawn.
 */
export function matchItem(query: string, label: string, keywords = ""): FuzzyMatch | null {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  let score = 0;
  let contiguous = true;
  const ranges: MatchRange[] = [];

  for (const term of terms) {
    const inLabel = fuzzyMatch(term, label);
    const inKeywords = keywords && !inLabel?.contiguous ? fuzzyMatch(term, keywords) : null;
    if (inLabel && (inLabel.contiguous || !inKeywords?.contiguous)) {
      score += inLabel.score;
      contiguous &&= inLabel.contiguous;
      ranges.push(...inLabel.ranges);
    } else if (inKeywords) {
      score += inKeywords.score * KEYWORD_FACTOR;
      contiguous &&= inKeywords.contiguous;
    } else {
      return null;
    }
  }
  return { score, ranges: mergeRanges(ranges), contiguous };
}

/** Sorts ranges and merges any that overlap or touch. */
export function mergeRanges(ranges: readonly MatchRange[]): MatchRange[] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

export interface Segment {
  text: string;
  match: boolean;
}

/** Cuts text into plain and matched runs, for drawing the highlight. */
export function highlightSegments(text: string, ranges: readonly MatchRange[]): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;
  for (const [start, end] of mergeRanges(ranges)) {
    const from = Math.max(start, cursor);
    const to = Math.min(end, text.length);
    if (from >= to) continue;
    if (from > cursor) segments.push({ text: text.slice(cursor, from), match: false });
    segments.push({ text: text.slice(from, to), match: true });
    cursor = to;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), match: false });
  return segments;
}
