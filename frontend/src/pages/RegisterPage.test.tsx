import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../api/client";
import { authApi } from "../api/resources";
import { ThemeProvider } from "../hooks/useTheme";
import { RegisterPage } from "./RegisterPage";

vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ state: { status: "signed-out" }, signIn: vi.fn() }),
}));

vi.mock("../api/resources", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/resources")>();
  return { ...actual, authApi: { ...actual.authApi, register: vi.fn() } };
});

describe("RegisterPage", () => {
  it("marks the Email field invalid when the email already has an account", async () => {
    vi.mocked(authApi.register).mockRejectedValue(
      new ApiError(409, "duplicate_email", "A user with this email already exists."),
    );
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <MemoryRouter>
          <RegisterPage />
        </MemoryRouter>
      </ThemeProvider>,
    );

    await user.type(screen.getByRole("textbox", { name: /Full name/ }), "Qa Alpha");
    await user.type(screen.getByRole("textbox", { name: /Email/ }), "qa.alpha@example.com");
    await user.type(screen.getByLabelText(/^Password/), "QaPassw0rd!2026");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(await screen.findByRole("button", { name: "Create account" }));

    // Back on step 1, with the field at fault marked as well as the notice.
    const email = await screen.findByRole("textbox", { name: /Email/ });
    expect(email).toHaveFocus();
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAccessibleDescription(/already has an account/);
    expect(screen.getByText("That email already has an account")).toBeInTheDocument();

    // Editing the email answers the objection.
    await user.type(email, "x");
    expect(email).not.toHaveAttribute("aria-invalid");
  });
});
