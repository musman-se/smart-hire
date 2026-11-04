import { describe, expect, it } from "vitest";

import { formatCombo, matchesChord, parseChord, parseCombo } from "./hotkeys";

const key = (k: string, mods: Partial<Record<"ctrl" | "meta" | "alt" | "shift", boolean>> = {}) => ({
  key: k,
  ctrlKey: mods.ctrl ?? false,
  metaKey: mods.meta ?? false,
  altKey: mods.alt ?? false,
  shiftKey: mods.shift ?? false,
});

describe("hotkey combos", () => {
  it("resolves mod to Cmd on macOS and Ctrl elsewhere", () => {
    expect(parseChord("mod+k", true)).toMatchObject({ key: "k", meta: true, ctrl: false });
    expect(parseChord("mod+k", false)).toMatchObject({ key: "k", meta: false, ctrl: true });
  });

  it("matches modifiers exactly", () => {
    const chord = parseChord("mod+k", false);
    expect(matchesChord(key("k", { ctrl: true }), chord)).toBe(true);
    expect(matchesChord(key("k"), chord)).toBe(false);
    expect(matchesChord(key("k", { ctrl: true, alt: true }), chord)).toBe(false);
  });

  it("ignores shift for punctuation, which the layout decides", () => {
    expect(matchesChord(key("?", { shift: true }), parseChord("?"))).toBe(true);
  });

  it("parses sequences and formats them for display", () => {
    expect(parseCombo("g j")).toHaveLength(2);
    expect(formatCombo("g j", false)).toEqual([["G"], ["J"]]);
    expect(formatCombo("mod+k", false)).toEqual([["Ctrl", "K"]]);
    expect(formatCombo("mod+k", true)).toEqual([["⌘", "K"]]);
  });
});
