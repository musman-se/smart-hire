import { describe, expect, it } from "vitest";

import { rankItems, type Rankable } from "./rank";

const items: Rankable[] = [
  { group: "Navigation", label: "Jobs", keywords: "postings roles" },
  { group: "Actions", label: "Create a job", keywords: "new posting" },
  { group: "Navigation", label: "Dashboard", keywords: "home overview" },
  { group: "Recent", label: "Backend Engineer" },
  { group: "Jobs", label: "Search all jobs", pinned: true },
];

const labels = (query: string) => rankItems(items, query).map(({ item }) => item.label);

describe("rankItems", () => {
  it("groups a blank query in the fixed order, keeping the given order inside", () => {
    expect(labels("")).toEqual([
      "Backend Engineer",
      "Create a job",
      "Jobs",
      "Dashboard",
      "Search all jobs",
    ]);
  });

  it("drops items that do not match, but keeps pinned ones", () => {
    expect(labels("dash")).toEqual(["Dashboard", "Search all jobs"]);
  });

  it("orders by group first, then by score", () => {
    const ranked = rankItems(
      [
        { group: "Navigation", label: "Job listings archive" },
        { group: "Navigation", label: "Jobs" },
        { group: "Actions", label: "Create a job" },
      ],
      "job",
    );
    expect(ranked.map(({ item }) => item.label)).toEqual([
      "Create a job",
      "Jobs",
      "Job listings archive",
    ]);
  });

  it("returns the ranges to highlight", () => {
    const [first] = rankItems([{ group: "Navigation", label: "Jobs" }], "ob");
    expect(first?.ranges).toEqual([[1, 3]]);
  });

  it("matches through keywords", () => {
    expect(labels("home")).toContain("Dashboard");
  });

  it("drops scattered matches once something matches as a whole", () => {
    const ranked = rankItems(
      [
        {
          group: "Recent",
          label: "Senior Backend Engineer",
          keywords: "Platform Engineering · Lahore or Remote (PKT)",
        },
        { group: "Actions", label: "Switch to dark theme", keywords: "toggle appearance" },
        { group: "Theme", label: "Dark", keywords: "theme appearance mode" },
        { group: "Jobs", label: "Search all jobs", pinned: true },
      ],
      "theme",
    );
    expect(ranked.map(({ item }) => item.label)).toEqual([
      "Switch to dark theme",
      "Search all jobs",
      "Dark",
    ]);
  });

  it("falls back to scattered matches when nothing matches as a whole", () => {
    expect(labels("dshbd")).toEqual(["Dashboard", "Search all jobs"]);
  });
});
