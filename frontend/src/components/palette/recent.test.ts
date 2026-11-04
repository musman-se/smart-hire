import { describe, expect, it } from "vitest";

import {
  forgetItem,
  isRecentItem,
  recentPath,
  rememberItem,
  type RecentItem,
} from "./recent";

const job = (id: string, title = `Job ${id}`): RecentItem => ({ kind: "job", id, title });

describe("rememberItem", () => {
  it("puts the newest item first", () => {
    const list = rememberItem([job("1")], job("2"));
    expect(list.map((item) => item.id)).toEqual(["2", "1"]);
  });

  it("moves a revisited item to the front instead of duplicating it", () => {
    const list = rememberItem([job("1"), job("2"), job("3")], job("2"));
    expect(list.map((item) => item.id)).toEqual(["2", "1", "3"]);
  });

  it("keeps a job and a candidate that share an id apart", () => {
    const list = rememberItem([job("1")], { kind: "candidate", id: "1", title: "Ada" });
    expect(list).toHaveLength(2);
  });

  it("caps the list", () => {
    const list = rememberItem([job("1"), job("2"), job("3")], job("4"), 3);
    expect(list.map((item) => item.id)).toEqual(["4", "1", "2"]);
  });

  it("returns the same array when the front item is unchanged", () => {
    const list = [job("1"), job("2")];
    expect(rememberItem(list, job("1"))).toBe(list);
  });

  it("refreshes a renamed item", () => {
    const list = rememberItem([job("1", "Old title")], job("1", "New title"));
    expect(list).toEqual([job("1", "New title")]);
  });
});

describe("forgetItem", () => {
  it("removes only the matching item", () => {
    expect(forgetItem([job("1"), job("2")], { kind: "job", id: "1" })).toEqual([job("2")]);
  });
});

describe("isRecentItem", () => {
  it("accepts well-formed items and rejects anything else", () => {
    expect(isRecentItem(job("1"))).toBe(true);
    expect(isRecentItem({ ...job("1"), subtitle: "Remote" })).toBe(true);
    expect(isRecentItem({ kind: "application", id: "1", title: "x" })).toBe(false);
    expect(isRecentItem({ kind: "job", id: 1, title: "x" })).toBe(false);
    expect(isRecentItem(null)).toBe(false);
    expect(isRecentItem("job")).toBe(false);
  });
});

describe("recentPath", () => {
  it("links to the detail page for the kind", () => {
    expect(recentPath({ kind: "job", id: "a" })).toBe("/jobs/a");
    expect(recentPath({ kind: "candidate", id: "b" })).toBe("/candidates/b");
  });
});
