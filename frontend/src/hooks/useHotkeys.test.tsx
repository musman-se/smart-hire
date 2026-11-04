import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { useHotkeys, type Hotkey } from "./useHotkeys";

function Harness({ hotkeys, modal }: { hotkeys: Hotkey[]; modal: boolean }) {
  useHotkeys(hotkeys);
  return (
    <div role="dialog" aria-modal={modal ? true : undefined}>
      <button type="button">Cancel</button>
    </div>
  );
}

describe("useHotkeys", () => {
  it("stands down while a modal is open, except for bindings that opt in", async () => {
    const navigate = vi.fn();
    const palette = vi.fn();
    const hotkeys: Hotkey[] = [
      { combo: "g j", handler: navigate },
      { combo: "ctrl+k", allowInModal: true, handler: palette },
    ];
    const { rerender } = render(<Harness hotkeys={hotkeys} modal />);
    const actor = userEvent.setup();

    await actor.click(screen.getByRole("button", { name: "Cancel" }));
    await actor.keyboard("gj");
    await actor.keyboard("{Control>}k{/Control}");
    expect(navigate).not.toHaveBeenCalled();
    expect(palette).toHaveBeenCalledOnce();

    rerender(<Harness hotkeys={hotkeys} modal={false} />);
    await actor.keyboard("gj");
    expect(navigate).toHaveBeenCalledOnce();
  });
});
