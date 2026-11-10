import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../api/client";
import { authApi } from "../../api/resources";
import type { User } from "../../api/types";
import { session } from "../../auth/session";
import { ToastProvider } from "../ui";
import { ChangePasswordCard } from "./ChangePasswordCard";

const account: User = {
  id: "u1",
  email: "cara@example.com",
  role: "candidate",
  created_at: "2026-11-01T00:00:00Z",
};

const fresh = {
  access_token: "new-access",
  token_type: "bearer" as const,
  expires_in: 900,
  refresh_token: "new-refresh",
};

function setup() {
  const user = userEvent.setup();
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ChangePasswordCard user={account} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { user };
}

async function openAndFill(
  user: ReturnType<typeof userEvent.setup>,
  fields: { current?: string; next?: string; confirm?: string } = {},
) {
  const { current = "old-password", next = "a-new-passphrase" } = fields;
  const confirm = fields.confirm ?? next;
  await user.click(screen.getByRole("button", { name: "Change password" }));
  await user.type(screen.getByLabelText(/^Current password/), current);
  await user.type(screen.getByLabelText(/^New password/), next);
  await user.type(screen.getByLabelText(/^Confirm new password/), confirm);
  await user.click(screen.getByRole("button", { name: "Update password" }));
}

describe("ChangePasswordCard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stays closed until asked", () => {
    setup();
    expect(screen.queryByLabelText(/^Current password/)).not.toBeInTheDocument();
  });

  it("changes the password, keeps this tab signed in on the new pair, and closes", async () => {
    const change = vi.spyOn(authApi, "changePassword").mockResolvedValue(fresh);
    const store = vi.spyOn(session, "store");
    const { user } = setup();

    await openAndFill(user);

    expect(change).toHaveBeenCalledWith("old-password", "a-new-passphrase");
    expect(store).toHaveBeenCalledWith(fresh);
    expect(await screen.findByText("Password changed")).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Current password/)).not.toBeInTheDocument();
  });

  it("does not send a confirmation that does not match", async () => {
    const change = vi.spyOn(authApi, "changePassword");
    const { user } = setup();

    await openAndFill(user, { confirm: "a-new-passphrasf" });

    expect(await screen.findByText("The passwords do not match")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Confirm new password/)).toHaveFocus();
    expect(change).not.toHaveBeenCalled();
  });

  it("puts a wrong current password on its field, and clears it on retyping", async () => {
    vi.spyOn(authApi, "changePassword").mockRejectedValue(
      new ApiError(403, "invalid_current_password", "The current password is incorrect."),
    );
    const store = vi.spyOn(session, "store");
    const { user } = setup();

    await openAndFill(user, { current: "not-my-password" });

    expect(await screen.findByText("That is not your current password")).toBeInTheDocument();
    const current = screen.getByLabelText(/^Current password/);
    expect(current).toHaveFocus();
    expect(store).not.toHaveBeenCalled();

    await user.type(current, "x");
    expect(screen.queryByText("That is not your current password")).not.toBeInTheDocument();
  });

  it("forgets what was typed when cancelled", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Change password" }));
    await user.type(screen.getByLabelText(/^Current password/), "half-typed");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(screen.getByLabelText(/^Current password/)).toHaveValue("");
  });
});
