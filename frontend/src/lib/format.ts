/**
 * Display formatting. Every date, count and label the UI shows goes through here, so
 * the whole app says "3d ago" and "Full time" the same way.
 */

type DateInput = string | number | Date | null | undefined;

const EMPTY = "—";

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "Mar 4, 2026". An em dash for a missing date. */
export function formatDate(value: DateInput): string {
  const date = toDate(value);
  if (!date) return EMPTY;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** "Mar 4, 2026, 14:05". */
export function formatDateTime(value: DateInput): string {
  const date = toDate(value);
  if (!date) return EMPTY;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "just now", "5m ago", "3h ago", "6d ago" — then the plain date, because "47d ago"
 * makes the reader do arithmetic. Future times read "in 5m" (an interview, say).
 * `now` is injectable so tests do not depend on the clock.
 */
export function formatRelative(value: DateInput, now: number = Date.now()): string {
  const date = toDate(value);
  if (!date) return EMPTY;

  const diff = now - date.getTime();
  const abs = Math.abs(diff);
  if (abs < 45_000) return "just now";

  let amount: string;
  if (abs < HOUR) amount = `${Math.max(1, Math.round(abs / MINUTE))}m`;
  else if (abs < DAY) amount = `${Math.round(abs / HOUR)}h`;
  else if (abs < 7 * DAY) amount = `${Math.round(abs / DAY)}d`;
  else return formatDate(date);

  return diff >= 0 ? `${amount} ago` : `in ${amount}`;
}

/** API identifiers to words: "full_time" → "Full time", "publish_failed" → "Publish failed". */
export function humanize(value: string | null | undefined): string {
  if (!value) return "";
  const words = value.replace(/[_-]+/g, " ").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** pluralize(1, "job") → "1 job"; pluralize(3, "match", "matches") → "3 matches". */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}

/**
 * Up to two letters for an avatar: "Ayesha Khan" → "AK", "ayesha" → "A". An email
 * falls back to its local part, so an account without a name still gets a letter.
 */
export function initials(name: string | null | undefined): string {
  const source = (name ?? "").split("@")[0]?.trim() ?? "";
  const words = source.split(/[\s._-]+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0]?.charAt(0) ?? "";
  const last = words.length > 1 ? (words[words.length - 1]?.charAt(0) ?? "") : "";
  return (first + last).toUpperCase();
}

/** A ratio (0–1) as a percentage: formatPercent(0.756) → "76%". */
export function formatPercent(ratio: number | null | undefined, fractionDigits = 0): string {
  if (ratio === null || ratio === undefined || Number.isNaN(ratio)) return EMPTY;
  return `${(ratio * 100).toFixed(fractionDigits)}%`;
}

/** 1234 → "1,234" in the user's locale. */
export function formatNumber(value: number): string {
  return value.toLocaleString();
}

/** "2 years", "1 year", "0 years" — the unit the experience fields are kept in. */
export function formatYears(years: number | null | undefined): string {
  if (years === null || years === undefined) return EMPTY;
  return pluralize(years, "year");
}

/** "Good morning" from five until noon, "Good afternoon" until six, else "Good evening". */
export function greeting(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  return "Good evening";
}
