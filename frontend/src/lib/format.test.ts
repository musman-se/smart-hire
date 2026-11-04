import { describe, expect, it } from "vitest";

import {
  formatDate,
  formatPercent,
  formatRelative,
  formatYears,
  greeting,
  humanize,
  initials,
  pluralize,
} from "./format";

describe("formatRelative", () => {
  const now = Date.parse("2026-03-10T12:00:00Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it("says 'just now' for the last 45 seconds", () => {
    expect(formatRelative(ago(10_000), now)).toBe("just now");
  });

  it("counts minutes, hours and days", () => {
    expect(formatRelative(ago(5 * 60_000), now)).toBe("5m ago");
    expect(formatRelative(ago(3 * 3_600_000), now)).toBe("3h ago");
    expect(formatRelative(ago(3 * 86_400_000), now)).toBe("3d ago");
  });

  it("falls back to the date after a week", () => {
    const value = ago(30 * 86_400_000);
    expect(formatRelative(value, now)).toBe(formatDate(value));
  });

  it("reads future times forward", () => {
    expect(formatRelative(new Date(now + 2 * 3_600_000).toISOString(), now)).toBe("in 2h");
  });

  it("renders a dash for missing or invalid input", () => {
    expect(formatRelative(null, now)).toBe("—");
    expect(formatRelative("not a date", now)).toBe("—");
  });
});

describe("humanize", () => {
  it("turns API identifiers into sentence case", () => {
    expect(humanize("full_time")).toBe("Full time");
    expect(humanize("publish_failed")).toBe("Publish failed");
    expect(humanize("applied")).toBe("Applied");
  });

  it("returns an empty string for nothing", () => {
    expect(humanize(undefined)).toBe("");
  });
});

describe("pluralize", () => {
  it("chooses the form from the count", () => {
    expect(pluralize(1, "job")).toBe("1 job");
    expect(pluralize(0, "job")).toBe("0 jobs");
    expect(pluralize(3, "match", "matches")).toBe("3 matches");
  });

  it("formats years of experience", () => {
    expect(formatYears(1)).toBe("1 year");
    expect(formatYears(4)).toBe("4 years");
  });
});

describe("initials", () => {
  it("takes the first and last word", () => {
    expect(initials("Ayesha Khan")).toBe("AK");
    expect(initials("Muhammad Ali Raza")).toBe("MR");
  });

  it("handles one word, emails and blanks", () => {
    expect(initials("ayesha")).toBe("A");
    expect(initials("ayesha.khan@example.com")).toBe("AK");
    expect(initials("  ")).toBe("?");
  });
});

describe("formatPercent", () => {
  it("formats a 0–1 ratio", () => {
    expect(formatPercent(0.756)).toBe("76%");
    expect(formatPercent(0.5, 1)).toBe("50.0%");
    expect(formatPercent(null)).toBe("—");
  });
});

describe("greeting", () => {
  it("follows the time of day", () => {
    expect(greeting(8)).toBe("Good morning");
    expect(greeting(12)).toBe("Good afternoon");
    expect(greeting(18)).toBe("Good evening");
    expect(greeting(2)).toBe("Good evening");
  });
});
