import { useEffect, useLayoutEffect, useRef } from "react";

import { CHARACTER_SHORTCUTS_KEY } from "../components/navigation";
import { matchesChord, parseCombo, type KeyChord } from "../lib/hotkeys";
import { useLocalStorage } from "./useLocalStorage";

export interface Hotkey {
  /** See lib/hotkeys.ts for the syntax: "mod+k", "?", "g j". */
  combo: string;
  handler: (event: KeyboardEvent) => void;
  /** Fire even while focus is in a text field. For mod+ combos, not for plain keys. */
  allowInInputs?: boolean;
  /** Fire even while a modal surface (aria-modal) is open. Only for ⌘K, which toggles
   * the palette itself. */
  allowInModal?: boolean;
}

/** A pause longer than this ends a sequence: "g", a coffee, then "j" is not "g j". */
const SEQUENCE_TIMEOUT_MS = 1000;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    return !["checkbox", "radio", "button", "submit", "reset", "range", "color"].includes(
      target.type,
    );
  }
  return false;
}

/** Typed with character keys alone: no Ctrl, Alt or ⌘ in any step. Shift does not
 * count — "?" is still a character key to someone dictating or with a tremor. */
function isCharacterShortcut(chords: readonly KeyChord[]): boolean {
  return chords.every((chord) => chord.key.length === 1 && !chord.ctrl && !chord.meta && !chord.alt);
}

/**
 * Global keyboard shortcuts, bound on window while the component is mounted.
 *
 * Plain-key shortcuts are ignored while the user is typing, or "g j" would fire in the
 * middle of writing a cover letter. They also stand down while any dialog or drawer
 * (aria-modal) is open, so nothing navigates or pulls focus out from under it — the
 * page's own bindings included, which cannot know a dialog sits on top of them. When a
 * shortcut fires, the event's default is prevented, so ⌘K does not also open the
 * browser's own search.
 *
 * Character-key shortcuts ("?", "/", "g j") obey the user's "Single-key shortcuts"
 * setting, applied here so no caller can forget it (WCAG 2.1.4). Shortcuts with Ctrl,
 * Alt or ⌘ always work.
 *
 * The list may be a new array every render: the listener is attached once and reads
 * the latest list through a ref.
 */
export function useHotkeys(hotkeys: readonly Hotkey[], { enabled = true } = {}): void {
  const [characterKeys] = useLocalStorage(CHARACTER_SHORTCUTS_KEY, true);
  const latest = useRef(hotkeys);
  const characterKeysOn = useRef(characterKeys);
  useLayoutEffect(() => {
    latest.current = hotkeys;
    characterKeysOn.current = characterKeys;
  });

  useEffect(() => {
    if (!enabled) return;
    let buffer: KeyboardEvent[] = [];
    let lastAt = 0;

    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing) return;
      const typing = isTypingTarget(event.target);
      const modal = document.querySelector('[aria-modal="true"]') !== null;

      const now = performance.now();
      if (now - lastAt > SEQUENCE_TIMEOUT_MS) buffer = [];
      lastAt = now;
      // Modifier presses on their own are not steps of a sequence.
      if (!["Shift", "Control", "Alt", "Meta"].includes(event.key)) {
        buffer = [...buffer.slice(-3), event];
      }

      for (const hotkey of latest.current) {
        if (typing && !hotkey.allowInInputs) continue;
        if (modal && !hotkey.allowInModal) continue;
        const chords = parseCombo(hotkey.combo);
        if (!characterKeysOn.current && isCharacterShortcut(chords)) continue;
        if (!endsWith(buffer, chords)) continue;
        event.preventDefault();
        buffer = [];
        hotkey.handler(event);
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}

function endsWith(buffer: KeyboardEvent[], chords: KeyChord[]): boolean {
  if (buffer.length < chords.length) return false;
  const tail = buffer.slice(-chords.length);
  return chords.every((chord, index) => {
    const event = tail[index];
    return event !== undefined && matchesChord(event, chord);
  });
}
