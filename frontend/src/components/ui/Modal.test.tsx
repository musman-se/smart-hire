import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { Button } from "./Button";
import { Modal } from "./Modal";

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Edit job"
        footer={<Button onClick={() => setOpen(false)}>Save</Button>}
      >
        <input aria-label="Title" />
      </Modal>
    </>
  );
}

describe("Modal", () => {
  it("is a labelled dialog that takes focus on open", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open" }));

    const dialog = screen.getByRole("dialog", { name: "Edit job" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    // The first focusable element: the header's close button.
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
  });

  it("closes on Escape and gives focus back to the trigger", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open" });
    await user.click(trigger);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("keeps Tab inside the dialog, in both directions", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open" }));

    const close = screen.getByRole("button", { name: "Close" });
    const input = screen.getByRole("textbox", { name: "Title" });
    const save = screen.getByRole("button", { name: "Save" });

    await user.tab();
    expect(input).toHaveFocus();
    await user.tab();
    expect(save).toHaveFocus();
    await user.tab(); // wraps
    expect(close).toHaveFocus();
    await user.tab({ shift: true }); // and back
    expect(save).toHaveFocus();
  });

  it("locks page scroll while open and restores it after", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(document.body.style.overflow).toBe("hidden");

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(document.body.style.overflow).toBe("");
  });
});
