/**
 * Keyboard combo strings, shared by useHotkeys (matching) and <Shortcut> (display), so
 * a shortcut is written once and shown exactly as it is bound.
 *
 * Syntax:
 *   "mod+k"   ⌘K on macOS, Ctrl+K elsewhere
 *   "shift+n" modifiers: mod, ctrl, meta, alt, shift — joined with "+"
 *   "?"       a single key, as KeyboardEvent.key reports it (case-insensitive)
 *   "g j"     a sequence: g, then j within a second
 */

export const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

export interface KeyChord {
  key: string;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
}

const KEY_ALIASES: Record<string, string> = {
  esc: "escape",
  space: " ",
  up: "arrowup",
  down: "arrowdown",
  left: "arrowleft",
  right: "arrowright",
  del: "delete",
  return: "enter",
};

/** "mod+shift+k" → one chord. `mac` is injectable for tests. */
export function parseChord(chord: string, mac = isMac): KeyChord {
  const parts = chord.toLowerCase().split("+");
  // "shift++" would split into a trailing empty part: the key is "+".
  const rawKey = parts.pop() || "+";
  const modifiers = new Set(parts);
  return {
    key: KEY_ALIASES[rawKey] ?? rawKey,
    ctrl: modifiers.has("ctrl") || (modifiers.has("mod") && !mac),
    meta: modifiers.has("meta") || (modifiers.has("mod") && mac),
    alt: modifiers.has("alt"),
    shift: modifiers.has("shift"),
  };
}

/** A combo is one chord, or a space-separated sequence of them. */
export function parseCombo(combo: string, mac = isMac): KeyChord[] {
  return combo.trim().split(/\s+/).map((chord) => parseChord(chord, mac));
}

type KeyEventLike = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">;

/**
 * Shift is only compared for letters and named keys. For punctuation the layout
 * decides whether Shift is needed ("?" is Shift+/ on US keyboards, not on others), and
 * event.key already reports the character produced.
 */
export function matchesChord(event: KeyEventLike, chord: KeyChord): boolean {
  const key = event.key.toLowerCase();
  if (key !== chord.key) return false;
  if (event.ctrlKey !== chord.ctrl || event.metaKey !== chord.meta || event.altKey !== chord.alt) {
    return false;
  }
  const shiftMatters = /^[a-z0-9]$/.test(key) || key.length > 1;
  return !shiftMatters || event.shiftKey === chord.shift;
}

const KEY_LABELS: Record<string, string> = {
  escape: "Esc",
  enter: "↵",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
  " ": "Space",
  backspace: "⌫",
  delete: "Del",
  tab: "Tab",
};

/** Display labels per chord: formatCombo("mod+k") → [["⌘", "K"]] on macOS. */
export function formatCombo(combo: string, mac = isMac): string[][] {
  return parseCombo(combo, mac).map((chord) => {
    const labels: string[] = [];
    if (chord.ctrl) labels.push(mac ? "⌃" : "Ctrl");
    if (chord.alt) labels.push(mac ? "⌥" : "Alt");
    if (chord.shift) labels.push(mac ? "⇧" : "Shift");
    if (chord.meta) labels.push(mac ? "⌘" : "Win");
    labels.push(KEY_LABELS[chord.key] ?? chord.key.toUpperCase());
    return labels;
  });
}
