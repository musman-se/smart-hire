/**
 * Every keyboard shortcut the user can press, grouped for the shortcuts dialog. The
 * shell's bindings come from navigation.ts; the ones added here are bound by
 * GlobalShortcuts from these same constants, so the dialog cannot drift from them.
 */

import type { Role } from "../../api/types";
import { isStaff } from "../../auth/roles";
import { GLOBAL_SHORTCUTS, NAV_ITEMS } from "../navigation";

/** The hiring team: start a new job from anywhere. Bound by GlobalShortcuts. */
export const NEW_JOB_SHORTCUT = "n";

/** A row is a bindable combo, drawn by <Shortcut>, or plain key caps for keys that
 * only mean something inside a widget (the palette's arrows). */
export type ShortcutRow =
  | { label: string; combo: string }
  | { label: string; keys: readonly string[] };

export interface ShortcutGroup {
  heading: string;
  rows: readonly ShortcutRow[];
}

/** Keys inside the command palette itself. */
const PALETTE_KEYS: readonly ShortcutRow[] = [
  { label: "Move through results", keys: ["↑", "↓"] },
  { label: "Jump to the first or last result", keys: ["Home", "End"] },
  { label: "Open the selected result", keys: ["↵"] },
  { label: "Clear the search, then close", keys: ["Esc"] },
];

/** Bound by individual pages; listed so they are discoverable in one place. */
const STAFF_PAGE_SHORTCUTS: readonly ShortcutRow[] = [
  { label: "Focus the search box on a list", combo: "/" },
  { label: "Save the job you are editing", combo: "mod+s" },
];

const PAGE_SHORTCUTS: Record<Role, readonly ShortcutRow[]> = {
  recruiter: STAFF_PAGE_SHORTCUTS,
  admin: STAFF_PAGE_SHORTCUTS,
  candidate: [{ label: "Save your profile", combo: "mod+s" }],
};

export function shortcutGroups(role: Role): ShortcutGroup[] {
  const actions: ShortcutRow[] =
    isStaff(role) ? [{ label: "Create a job", combo: NEW_JOB_SHORTCUT }] : [];

  return [
    { heading: "General", rows: GLOBAL_SHORTCUTS },
    {
      heading: "Go to",
      rows: NAV_ITEMS[role].map((item) => ({ label: item.label, combo: item.shortcut })),
    },
    { heading: "Actions", rows: actions },
    { heading: "On pages", rows: PAGE_SHORTCUTS[role] },
    { heading: "In the command palette", rows: PALETTE_KEYS },
  ].filter((group) => group.rows.length > 0);
}
