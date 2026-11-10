/**
 * Where each role can go, written once. The sidebar, the command palette, the
 * shortcuts dialog and the "g …" hotkeys all read this list, so they can never
 * disagree about a destination or its shortcut.
 */

import type { Role } from "../api/types";
import type { IconName } from "./ui";

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  /** A key sequence, in useHotkeys syntax: "g d". */
  shortcut: string;
  /** Extra words the command palette matches on. */
  keywords?: string;
}

const RECRUITER_NAV: readonly NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: "dashboard", shortcut: "g d", keywords: "home overview" },
  { to: "/jobs", label: "Jobs", icon: "briefcase", shortcut: "g j", keywords: "postings roles" },
  { to: "/applications", label: "Applications", icon: "inbox", shortcut: "g a", keywords: "review queue" },
  { to: "/candidates", label: "Candidates", icon: "users", shortcut: "g c", keywords: "people talent" },
];

export const NAV_ITEMS: Record<Role, readonly NavItem[]> = {
  recruiter: RECRUITER_NAV,
  // An admin is a recruiter who also manages the hiring team.
  admin: [
    ...RECRUITER_NAV,
    { to: "/team", label: "Team", icon: "user-plus", shortcut: "g t", keywords: "recruiters staff invite people" },
  ],
  candidate: [
    { to: "/home", label: "Home", icon: "home", shortcut: "g h", keywords: "dashboard overview" },
    { to: "/jobs", label: "Find jobs", icon: "search", shortcut: "g j", keywords: "browse roles openings" },
    { to: "/applications", label: "My applications", icon: "inbox", shortcut: "g a", keywords: "status" },
    { to: "/profile", label: "Profile", icon: "user", shortcut: "g p", keywords: "skills resume account" },
  ],
};

/** Shortcuts that are not navigation, for the shortcuts dialog. The shell binds them. */
export const GLOBAL_SHORTCUTS = [
  { combo: "mod+k", label: "Open the command palette" },
  { combo: "?", label: "Show keyboard shortcuts" },
  { combo: "[", label: "Collapse or expand the sidebar" },
] as const;

/** Where "home" is for each role — the landing page after sign-in. */
export const ROLE_HOME: Record<Role, string> = {
  recruiter: "/dashboard",
  admin: "/dashboard",
  candidate: "/home",
};

/** The shell's sidebar preference; the profile page's appearance settings edit it too. */
export const SIDEBAR_COLLAPSED_KEY = "smarthire.sidebar-collapsed";

/** Single-key shortcuts can be switched off (WCAG 2.1.4): speech input and tremors
 * trigger them by accident. useHotkeys applies it; the appearance settings edit it. */
export const CHARACTER_SHORTCUTS_KEY = "smarthire.character-shortcuts";

/** Per-route options the shell reads from `handle` in router.tsx. */
export interface RouteHandle {
  /** Let the page use the full width instead of --content-max: the pipeline board. */
  wide?: boolean;
}
