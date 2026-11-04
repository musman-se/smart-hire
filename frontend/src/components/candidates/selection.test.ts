import { describe, expect, it } from "vitest";

import { emailList, reconcileSelection } from "./selection";

const ayesha = { id: "a", email: "ayesha@example.com", name: "Ayesha" };
const bilal = { id: "b", email: "bilal@example.com", name: "Bilal" };
const sana = { id: "s", email: "sana@example.com", name: "Sana" };

describe("reconcileSelection", () => {
  it("keeps rows selected on another page", () => {
    const previous = new Map([["a", ayesha]]);
    const next = reconcileSelection(previous, new Set(["a", "b"]), [bilal, sana]);
    expect([...next.values()]).toEqual([ayesha, bilal]);
  });

  it("drops rows that were unselected", () => {
    const previous = new Map([
      ["a", ayesha],
      ["b", bilal],
    ]);
    const next = reconcileSelection(previous, new Set(["b"]), [ayesha, bilal]);
    expect([...next.keys()]).toEqual(["b"]);
  });

  it("prefers the freshly loaded copy of a row", () => {
    const renamed = { ...ayesha, name: "Ayesha Khan" };
    const next = reconcileSelection(new Map([["a", ayesha]]), new Set(["a"]), [renamed]);
    expect(next.get("a")).toBe(renamed);
  });

  it("ignores ids it has never seen", () => {
    expect(reconcileSelection(new Map(), new Set(["ghost"]), []).size).toBe(0);
  });
});

describe("emailList", () => {
  it("puts one address per line, without duplicates or blanks", () => {
    expect(emailList([ayesha, bilal, ayesha, { email: "" }])).toBe(
      "ayesha@example.com\nbilal@example.com",
    );
  });

  it("is empty for no rows", () => {
    expect(emailList([])).toBe("");
  });
});
