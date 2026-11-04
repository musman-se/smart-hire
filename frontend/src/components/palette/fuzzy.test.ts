import { describe, expect, it } from "vitest";

import { fuzzyMatch, highlightSegments, matchItem, mergeRanges } from "./fuzzy";

describe("fuzzyMatch", () => {
  it("matches everything for an empty term", () => {
    expect(fuzzyMatch("  ", "Jobs")).toEqual({ score: 0, ranges: [], contiguous: true });
  });

  it("finds a contiguous hit case-insensitively", () => {
    expect(fuzzyMatch("JOB", "Go to Jobs")?.ranges).toEqual([[6, 9]]);
  });

  it("prefers the occurrence that starts a word", () => {
    // "art" inside "Start" comes first, but "Artist" starts a word.
    expect(fuzzyMatch("art", "Start Artist")?.ranges).toEqual([[6, 9]]);
  });

  it("falls back to characters in order", () => {
    expect(fuzzyMatch("gtj", "Go to Jobs")?.ranges).toEqual([
      [0, 1],
      [3, 4],
      [6, 7],
    ]);
  });

  it("returns null when a character is missing or out of order", () => {
    expect(fuzzyMatch("xyz", "Go to Jobs")).toBeNull();
    expect(fuzzyMatch("sj", "Jobs")).toBeNull();
  });

  it("ranks a contiguous hit above a scattered one", () => {
    const contiguous = fuzzyMatch("job", "Jobs")!;
    const scattered = fuzzyMatch("job", "Junior Operations Backend")!;
    expect(contiguous.score).toBeGreaterThan(scattered.score);
  });

  it("ranks a prefix above a mid-word hit, and a short text above a long one", () => {
    expect(fuzzyMatch("dev", "Developer")!.score).toBeGreaterThan(
      fuzzyMatch("dev", "Frontend dev lead")!.score,
    );
    expect(fuzzyMatch("dev", "Dev")!.score).toBeGreaterThan(fuzzyMatch("dev", "Developer")!.score);
  });

  it("ignores whitespace inside a term", () => {
    expect(fuzzyMatch("go to", "Go to Jobs")?.ranges).toEqual([
      [0, 2],
      [3, 5],
    ]);
  });
});

describe("matchItem", () => {
  it("requires every term", () => {
    expect(matchItem("go jobs", "Go to Jobs")).not.toBeNull();
    expect(matchItem("go nowhere", "Go to Jobs")).toBeNull();
  });

  it("uses keywords for terms the label lacks, without highlighting them", () => {
    const match = matchItem("new job", "Create a job", "new posting");
    expect(match?.ranges).toEqual([[9, 12]]);
  });

  it("scores a label hit above a keyword-only hit", () => {
    const label = matchItem("home", "Home", "")!;
    const keyword = matchItem("home", "Dashboard", "home overview")!;
    expect(label.score).toBeGreaterThan(keyword.score);
  });

  it("matches anything for a blank query", () => {
    expect(matchItem("   ", "Anything")).toEqual({ score: 0, ranges: [], contiguous: true });
  });

  it("is contiguous only when every term is an unbroken run", () => {
    expect(matchItem("go jobs", "Go to Jobs")?.contiguous).toBe(true);
    expect(matchItem("go gtj", "Go to Jobs")?.contiguous).toBe(false);
  });

  it("prefers a contiguous keyword hit over a scattered label hit", () => {
    const match = matchItem("theme", "The meeting room", "theme appearance");
    expect(match?.contiguous).toBe(true);
    expect(match?.ranges).toEqual([]);
  });
});

describe("mergeRanges", () => {
  it("sorts and merges overlapping or touching ranges", () => {
    expect(
      mergeRanges([
        [5, 7],
        [0, 2],
        [2, 3],
        [6, 9],
      ]),
    ).toEqual([
      [0, 3],
      [5, 9],
    ]);
  });
});

describe("highlightSegments", () => {
  it("splits text into plain and matched runs", () => {
    expect(highlightSegments("Go to Jobs", [[6, 9]])).toEqual([
      { text: "Go to ", match: false },
      { text: "Job", match: true },
      { text: "s", match: false },
    ]);
  });

  it("returns the whole text when nothing matched", () => {
    expect(highlightSegments("Jobs", [])).toEqual([{ text: "Jobs", match: false }]);
  });

  it("clamps ranges that run past the end", () => {
    expect(highlightSegments("Jo", [[1, 10]])).toEqual([
      { text: "J", match: false },
      { text: "o", match: true },
    ]);
  });
});
