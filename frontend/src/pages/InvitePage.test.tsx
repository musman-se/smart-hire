import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../api/client";
import { authApi } from "../api/resources";
import type { TokenPair } from "../api/types";
import { ThemeProvider } from "../hooks/useTheme";
import { InvitePage } from "./InvitePage";

const adoptSession = vi.fn();
const signOut = vi.fn();
const auth = {
  state: { status: "signed-out" } as
    | { status: "signed-out" }
    | { status: "signed-in"; user: { id: string; email: string; role: string; created_at: string } },
};

vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ state: auth.state, adoptSession, signOut }),
}));

vi.mock("../api/resources", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/resources")>();
  return {
    ...actual,
    authApi: { ...actual.authApi, previewInvitation: vi.fn(), acceptInvitation: vi.fn() },
  };
});

const TOKENS: TokenPair = {
  access_token: "access",
  token_type: "bearer",
  expires_in: 900,
  refresh_token: "refresh",
};

/** Opens /invite the way a link would: the token in the real address bar's fragment. */
function openInvite(hash: string) {
  window.history.replaceState(null, "", `/invite${hash}`);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <MemoryRouter initialEntries={["/invite"]}>
          <Routes>
            <Route path="/invite" element={<InvitePage />} />
            <Route path="/" element={<p>Console home</p>} />
            <Route path="/login" element={<p>Sign-in page</p>} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

// Fields are filled by paste: typing key by key is slow enough to time out under the
// full suite.
describe("InvitePage", () => {
  beforeEach(() => {
    auth.state = { status: "signed-out" };
    adoptSession.mockReset().mockResolvedValue(undefined);
    signOut.mockReset();
    vi.mocked(authApi.previewInvitation).mockReset().mockResolvedValue({
      email: "noor@example.com",
      full_name: "Noor Aziz",
      expires_at: "2026-11-17T12:00:00Z",
    });
    vi.mocked(authApi.acceptInvitation).mockReset().mockResolvedValue(TOKENS);
  });

  afterEach(() => {
    window.history.replaceState(null, "", "/");
    sessionStorage.clear();
  });

  it("still finds the token when the page is reloaded", async () => {
    openInvite("#tok-abc_123");
    await screen.findByRole("heading", { name: "Welcome, Noor Aziz" });
    expect(window.location.hash).toBe("");

    // A reload: the address bar no longer has the token, but this tab kept it.
    cleanup();
    openInvite("");

    expect(await screen.findByRole("heading", { name: "Welcome, Noor Aziz" })).toBeInTheDocument();
    expect(authApi.previewInvitation).toHaveBeenLastCalledWith("tok-abc_123");
  });

  it("forgets the token once the link is used", async () => {
    const user = userEvent.setup();
    openInvite("#tok-abc_123");
    await screen.findByRole("heading", { name: "Welcome, Noor Aziz" });

    await user.click(screen.getByLabelText(/^Password/));
    await user.paste("Sturdy-Passphrase-42");
    await user.click(screen.getByLabelText(/^Confirm password/));
    await user.paste("Sturdy-Passphrase-42");
    await user.click(screen.getByRole("button", { name: "Set password and sign in" }));
    await screen.findByText("Console home");

    expect(sessionStorage.length).toBe(0);
  });

  it("forgets a token that does not work", async () => {
    vi.mocked(authApi.previewInvitation).mockRejectedValue(
      new ApiError(404, "invalid_invitation", "This invitation link is not valid."),
    );
    openInvite("#tok-spent");

    await screen.findByText(/invalid, expired or already used/);
    expect(sessionStorage.length).toBe(0);
  });

  it("takes the token out of the address bar", async () => {
    openInvite("#tok-abc_123");

    expect(await screen.findByRole("heading", { name: "Welcome, Noor Aziz" })).toBeInTheDocument();
    expect(authApi.previewInvitation).toHaveBeenCalledWith("tok-abc_123");
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/invite");
  });

  it("sets the password, adopts the returned session and opens the console", async () => {
    const user = userEvent.setup();
    openInvite("#tok-abc_123");
    await screen.findByRole("heading", { name: "Welcome, Noor Aziz" });
    expect(screen.getByText("noor@example.com")).toBeInTheDocument();

    await user.click(screen.getByLabelText(/^Password/));
    await user.paste("Sturdy-Passphrase-42");
    await user.click(screen.getByLabelText(/^Confirm password/));
    await user.paste("Sturdy-Passphrase-42");
    await user.click(screen.getByRole("button", { name: "Set password and sign in" }));

    expect(authApi.acceptInvitation).toHaveBeenCalledWith("tok-abc_123", "Sturdy-Passphrase-42");
    await waitFor(() => expect(adoptSession).toHaveBeenCalledWith(TOKENS));
    expect(await screen.findByText("Console home")).toBeInTheDocument();
  });

  it("refuses mismatched passwords before asking the server", async () => {
    const user = userEvent.setup();
    openInvite("#tok-abc_123");
    await screen.findByRole("heading", { name: "Welcome, Noor Aziz" });

    await user.click(screen.getByLabelText(/^Password/));
    await user.paste("Sturdy-Passphrase-42");
    await user.click(screen.getByLabelText(/^Confirm password/));
    await user.paste("Sturdy-Passphrase-43");
    await user.click(screen.getByRole("button", { name: "Set password and sign in" }));

    expect(screen.getByLabelText(/^Confirm password/)).toHaveAccessibleDescription("The passwords do not match");
    expect(authApi.acceptInvitation).not.toHaveBeenCalled();
  });

  it("says plainly when the link is invalid, expired or used", async () => {
    vi.mocked(authApi.previewInvitation).mockRejectedValue(
      new ApiError(404, "invalid_invitation", "This invitation link is not valid."),
    );
    openInvite("#tok-spent");

    expect(
      await screen.findByText("This link is invalid, expired or already used. Ask your admin for a new one."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });

  it("says the same when the link has no token, without asking the server", () => {
    openInvite("");

    expect(screen.getByText(/invalid, expired or already used/)).toBeInTheDocument();
    expect(authApi.previewInvitation).not.toHaveBeenCalled();
  });

  it("asks someone already signed in to sign out first", async () => {
    auth.state = {
      status: "signed-in",
      user: { id: "a1", email: "ada@example.com", role: "admin", created_at: "" },
    };
    const user = userEvent.setup();
    openInvite("#tok-abc_123");

    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(authApi.previewInvitation).not.toHaveBeenCalled();
    // The token is still taken out of the address bar.
    expect(window.location.hash).toBe("");

    await user.click(screen.getByRole("button", { name: "Sign out and continue" }));
    expect(signOut).toHaveBeenCalled();
  });

  it("forgets the token when a signed-in visitor stays signed in", async () => {
    auth.state = {
      status: "signed-in",
      user: { id: "a1", email: "ada@example.com", role: "admin", created_at: "" },
    };
    const user = userEvent.setup();
    openInvite("#tok-abc_123");

    await user.click(screen.getByRole("link", { name: "Stay signed in" }));

    expect(sessionStorage.length).toBe(0);
    expect(await screen.findByText("Console home")).toBeInTheDocument();
  });

  it("keeps the form, and the link, when the server refuses the password itself", async () => {
    vi.mocked(authApi.acceptInvitation).mockRejectedValue(
      new ApiError(422, "validation_error", "password: String should have at most 128 characters"),
    );
    const user = userEvent.setup();
    openInvite("#tok-abc_123");
    await screen.findByRole("heading", { name: "Welcome, Noor Aziz" });

    await user.click(screen.getByLabelText(/^Password/));
    await user.paste("Sturdy-Passphrase-42");
    await user.click(screen.getByLabelText(/^Confirm password/));
    await user.paste("Sturdy-Passphrase-42");
    await user.click(screen.getByRole("button", { name: "Set password and sign in" }));

    expect(await screen.findByText(/at most 128 characters/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Welcome, Noor Aziz" })).toBeInTheDocument();
    expect(screen.queryByText(/invalid, expired or already used/)).not.toBeInTheDocument();
    expect(sessionStorage.length).toBe(1);
  });

  it("starts over when a second link is opened in the same tab", async () => {
    vi.mocked(authApi.previewInvitation).mockImplementation(async (token: string) => ({
      email: token === "tok-second" ? "sam@example.com" : "noor@example.com",
      full_name: token === "tok-second" ? "Sam Lee" : "Noor Aziz",
      expires_at: "2026-11-17T12:00:00Z",
    }));
    function OpenSecondLink() {
      const navigate = useNavigate();
      return (
        <button
          onClick={() => {
            // Pasting a link that differs only after "#": no reload, a new fragment.
            window.history.replaceState(null, "", "/invite#tok-second");
            navigate("/invite#tok-second");
          }}
        >
          Open second link
        </button>
      );
    }
    window.history.replaceState(null, "", "/invite#tok-first");
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ThemeProvider>
          <MemoryRouter initialEntries={["/invite#tok-first"]}>
            <OpenSecondLink />
            <Routes>
              <Route path="/invite" element={<InvitePage />} />
            </Routes>
          </MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>,
    );
    await screen.findByRole("heading", { name: "Welcome, Noor Aziz" });

    await user.click(screen.getByRole("button", { name: "Open second link" }));

    expect(await screen.findByRole("heading", { name: "Welcome, Sam Lee" })).toBeInTheDocument();
    expect(authApi.previewInvitation).toHaveBeenLastCalledWith("tok-second");
  });

  it("treats a token the server will not look up (422) as a dead link, not a retry", async () => {
    vi.mocked(authApi.previewInvitation).mockRejectedValue(
      new ApiError(422, "validation_error", "token: String should have at most 200 characters"),
    );
    openInvite(`#${"x".repeat(300)}`);

    expect(await screen.findByText(/invalid, expired or already used/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });
});
