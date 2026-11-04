import { useUser } from "../auth/AuthProvider";
import { GlobalShortcuts } from "./palette/GlobalShortcuts";
import { PaletteDialog } from "./palette/PaletteDialog";
import { RecentTracker } from "./palette/RecentTracker";
import { useRecentItems } from "./palette/recent";

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  /** Opens the shell's shortcuts dialog — there is one, and the shell owns it. */
  onShowShortcuts: () => void;
}

/**
 * ⌘K / Ctrl K: jump to any page, job or candidate, or run an action, from the keyboard.
 * The shell owns `open` and the ⌘K binding.
 *
 * The shell mounts this whether or not the palette is open, so it is also home to the
 * always-on parts of the power-user layer: the extra global shortcuts and the tracker
 * that fills "Recent". The dialog itself mounts fresh on every open, so the query and
 * the highlight start clean.
 */
export function CommandPalette({ open, onClose, onShowShortcuts }: CommandPaletteProps) {
  const user = useUser();
  const recent = useRecentItems(user.id);

  return (
    <>
      <GlobalShortcuts />
      <RecentTracker remember={recent.remember} forget={recent.forget} />
      {open && <PaletteDialog recent={recent} onClose={onClose} onShowShortcuts={onShowShortcuts} />}
    </>
  );
}
