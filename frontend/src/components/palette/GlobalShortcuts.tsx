import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useUser } from "../../auth/AuthProvider";
import { useHotkeys, type Hotkey } from "../../hooks/useHotkeys";
import { NEW_JOB_SHORTCUT } from "./shortcuts";

/**
 * Shortcuts that add to the shell's own (⌘K, ?, [, and the "g …" sequences, which
 * Layout binds from navigation.ts). Rendered by CommandPalette, which the shell always
 * mounts. useHotkeys stands them down while the palette or any other dialog is open,
 * so nothing navigates out from under a form someone is filling in.
 */
export function GlobalShortcuts() {
  const user = useUser();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const hotkeys = useMemo<Hotkey[]>(() => {
    if (user.role !== "recruiter") return [];
    return [
      {
        combo: NEW_JOB_SHORTCUT,
        handler: () => {
          if (pathname !== "/jobs/new") navigate("/jobs/new");
        },
      },
    ];
  }, [user.role, pathname, navigate]);

  useHotkeys(hotkeys);
  return null;
}
