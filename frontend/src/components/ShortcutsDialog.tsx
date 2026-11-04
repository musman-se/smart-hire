import { useId } from "react";

import { useUser } from "../auth/AuthProvider";
import { isMac } from "../lib/hotkeys";
import { shortcutGroups, type ShortcutRow } from "./palette/shortcuts";
import { Kbd, Modal, Shortcut } from "./ui";

export interface ShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Every keyboard shortcut, grouped, read from the same lists that bind them. Opened
 * with "?", from the user menu, or from the command palette. Keys are drawn for this
 * platform: ⌘ on a Mac, Ctrl elsewhere.
 */
export function ShortcutsDialog({ open, onClose }: ShortcutsDialogProps) {
  const user = useUser();
  const groups = shortcutGroups(user.role);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Keyboard shortcuts"
      description={
        <>
          Single-key shortcuts pause while you type in a field. Sequences like{" "}
          <Shortcut combo="g j" /> are pressed one key after the other.
        </>
      }
      size="lg"
    >
      <div className="shortcuts-grid">
        {groups.map((group) => (
          <ShortcutSection key={group.heading} heading={group.heading} rows={group.rows} />
        ))}
      </div>
      <p className="shortcuts-platform subtle text-xs">
        Showing keys for {isMac ? "macOS" : "Windows and Linux"}.
      </p>
    </Modal>
  );
}

function ShortcutSection({ heading, rows }: { heading: string; rows: readonly ShortcutRow[] }) {
  const headingId = useId();
  return (
    <section className="shortcuts-section" aria-labelledby={headingId}>
      <h3 id={headingId} className="shortcuts-heading">
        {heading}
      </h3>
      <ul className="shortcuts-list">
        {rows.map((row) => (
          <li key={row.label} className="shortcuts-row">
            <span>{row.label}</span>
            {"combo" in row ? (
              <Shortcut combo={row.combo} />
            ) : (
              <span className="kbd-combo">
                {row.keys.map((key) => (
                  <Kbd key={key}>{key}</Kbd>
                ))}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
