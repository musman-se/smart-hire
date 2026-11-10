import { describe, expect, it } from "vitest";

import { NAV_ITEMS } from "../navigation";
import { NEW_JOB_SHORTCUT, shortcutGroups, type ShortcutRow } from "./shortcuts";

const combos = (rows: readonly ShortcutRow[]) =>
  rows.flatMap((row) => ("combo" in row ? [row.combo] : []));

describe("shortcutGroups", () => {
  it("lists every navigation shortcut for the role", () => {
    for (const role of ["recruiter", "admin", "candidate"] as const) {
      const goTo = shortcutGroups(role).find((group) => group.heading === "Go to");
      expect(combos(goTo?.rows ?? [])).toEqual(NAV_ITEMS[role].map((item) => item.shortcut));
    }
  });

  it("offers the new-job shortcut to the hiring team only", () => {
    const all = (role: "recruiter" | "admin" | "candidate") =>
      shortcutGroups(role).flatMap((group) => combos(group.rows));
    expect(all("recruiter")).toContain(NEW_JOB_SHORTCUT);
    expect(all("admin")).toContain(NEW_JOB_SHORTCUT);
    expect(all("candidate")).not.toContain(NEW_JOB_SHORTCUT);
  });

  it("leaves out empty groups", () => {
    const headings = shortcutGroups("candidate").map((group) => group.heading);
    expect(headings).not.toContain("Actions");
  });

  it("never binds one global combo to two things", () => {
    for (const role of ["recruiter", "admin", "candidate"] as const) {
      const bound = shortcutGroups(role)
        .filter((group) => group.heading !== "On pages")
        .flatMap((group) => combos(group.rows));
      expect(new Set(bound).size).toBe(bound.length);
    }
  });
});
