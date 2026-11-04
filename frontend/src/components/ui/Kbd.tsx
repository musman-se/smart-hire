import { Fragment, type ReactNode } from "react";

import { cx } from "../../lib/cx";
import { formatCombo } from "../../lib/hotkeys";

/** One key cap. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={cx("kbd", className)}>{children}</kbd>;
}

/**
 * A shortcut drawn from the same combo string useHotkeys binds — "mod+k" shows ⌘ K on
 * a Mac and Ctrl K elsewhere; "g j" shows G then J.
 *
 * The caps are drawn for the eye only; screen readers get the combo spelled out once
 * ("Ctrl K"), not each cap as a separate item.
 */
export function Shortcut({ combo, className }: { combo: string; className?: string }) {
  const chords = formatCombo(combo);
  return (
    <span className={cx("kbd-combo", className)}>
      <span className="sr-only">{describe(chords)}</span>
      <span className="kbd-combo" aria-hidden="true">
        {chords.map((keys, chordIndex) => (
          <Fragment key={chordIndex}>
            {chordIndex > 0 && <span className="kbd-then">then</span>}
            {keys.map((key) => (
              <Kbd key={key}>{key}</Kbd>
            ))}
          </Fragment>
        ))}
      </span>
    </span>
  );
}

function describe(chords: string[][]): string {
  return chords.map((keys) => keys.join(" ")).join(", then ");
}
