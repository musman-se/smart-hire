import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../api/client";
import { ThemeProvider } from "../hooks/useTheme";
import { LoginPage } from "./LoginPage";

const signIn = vi.fn();

vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ state: { status: "signed-out" }, signIn }),
}));

function renderLogin() {
  render(
    <ThemeProvider>
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

async function submit(email: string, password: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/^email/i), email);
  await user.type(screen.getByLabelText(/^password/i), password);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("LoginPage", () => {
  beforeEach(() => {
    signIn.mockReset();
    try {
      localStorage.clear();
    } catch {
      // No storage in this environment: nothing remembered to clear.
    }
  });

  it("says a wrong password in plain words, without the support reference", async () => {
    signIn.mockRejectedValue(new ApiError(401, "invalid_credentials", "Invalid credentials", "513dd5d4"));
    renderLogin();
    await submit("cara@example.com", "wrong-password");

    expect(await screen.findByText("The email or password is incorrect.")).toBeInTheDocument();
    expect(screen.queryByText(/invalid_credentials/)).not.toBeInTheDocument();
    expect(screen.queryByText(/513dd5d4/)).not.toBeInTheDocument();
  });

  it("tells a deactivated user who can let them back in", async () => {
    signIn.mockRejectedValue(
      new ApiError(
        403,
        "account_deactivated",
        "This account has been deactivated. Ask your admin to reactivate it.",
        "d3ac71ff",
      ),
    );
    renderLogin();
    await submit("sara@example.com", "right-password");

    expect(await screen.findByText("This account has been deactivated")).toBeInTheDocument();
    expect(screen.getByText(/Ask your admin to reactivate it/)).toBeInTheDocument();
    expect(screen.queryByText("The email or password is incorrect.")).not.toBeInTheDocument();
    expect(screen.queryByText(/d3ac71ff/)).not.toBeInTheDocument();
  });

  it("keeps the support reference for a real failure", async () => {
    signIn.mockRejectedValue(new ApiError(500, "internal_error", "Something went wrong", "c0ffee12"));
    renderLogin();
    await submit("cara@example.com", "any-password");

    expect(await screen.findByText(/c0ffee12/)).toBeInTheDocument();
  });
});
