import type { Candidate } from "../../api/types";

/*
 * CSV export, built in the browser from rows already loaded — the API has no export
 * endpoint, and the recruiter only ever exports what they can see.
 */

/** A spreadsheet treats a cell starting with one of these as a formula. */
const FORMULA_TRIGGERS = /^[=+\-@\t\r]/;
/**
 * "-3" and "+4.5" are plain numbers, not formulas, and must survive unchanged. Anything
 * longer that starts with a trigger is escaped: a spreadsheet computes "+92-300-1234567".
 */
const PLAIN_NUMBER = /^[+-]?\d+(\.\d+)?$/;

/**
 * One cell, escaped per RFC 4180: quoted when it holds a comma, quote, newline or
 * edge whitespace, with inner quotes doubled.
 *
 * Profile fields are typed by candidates, so a headline of `=HYPERLINK(...)` would
 * run when a recruiter opens the file (CSV injection). Such cells get a leading
 * apostrophe, which spreadsheets read as "this is text".
 */
export function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (FORMULA_TRIGGERS.test(text) && !PLAIN_NUMBER.test(text)) text = `'${text}`;
  return /[",\r\n]|^\s|\s$/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(
  header: readonly string[],
  rows: readonly (readonly (string | number | null | undefined)[])[],
): string {
  // CRLF is what RFC 4180 specifies and what Excel expects.
  return [header, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
}

const CANDIDATE_HEADER = [
  "Name",
  "Email",
  "Phone",
  "Headline",
  "Years of experience",
  "Skills",
  "Resume URL",
  "Registered",
  "Profile ID",
] as const;

export function candidatesToCsv(candidates: readonly Candidate[]): string {
  return toCsv(
    CANDIDATE_HEADER,
    candidates.map((candidate) => [
      candidate.full_name,
      candidate.email,
      candidate.phone,
      candidate.headline,
      candidate.years_experience,
      // A semicolon keeps the list in one cell without needing quotes.
      (candidate.skills ?? []).join("; "),
      candidate.resume_url,
      candidate.created_at,
      candidate.id,
    ]),
  );
}

/** "smarthire-candidates-2026-11-03.csv", in the user's local date. */
export function csvFileName(subject: string, now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `smarthire-${subject}-${date}.csv`;
}

/** Hands the text to the browser as a file download. The byte-order mark makes Excel
 * read the file as UTF-8, so names like "Zoë" survive the round trip. */
export function downloadCsv(fileName: string, csv: string): void {
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  // Revoked on the next tick: some browsers start the download asynchronously.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
