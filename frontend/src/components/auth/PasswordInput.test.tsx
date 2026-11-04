import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Field } from "../ui";
import { PasswordInput } from "./PasswordInput";

function renderPassword() {
  render(
    <Field label="Password">
      <PasswordInput defaultValue="secret" />
    </Field>,
  );
  return screen.getByLabelText("Password") as HTMLInputElement;
}

describe("PasswordInput", () => {
  it("shows and hides the password", async () => {
    const input = renderPassword();
    expect(input.type).toBe("password");

    await userEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input.type).toBe("text");

    await userEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input.type).toBe("password");
  });

  it("warns about Caps Lock while typing and links the warning to the field", () => {
    const input = renderPassword();
    fireEvent.keyDown(input, { key: "A", modifierCapsLock: true });

    const warning = screen.getByText("Caps Lock is on");
    expect(input.getAttribute("aria-describedby")).toContain(warning.closest("[id]")?.id);

    fireEvent.blur(input);
    expect(screen.queryByText("Caps Lock is on")).toBeNull();
  });
});
