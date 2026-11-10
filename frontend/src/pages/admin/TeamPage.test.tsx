import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../api/client";
import { teamApi } from "../../api/resources";
import type { StaffMember } from "../../api/types";
import { ConfirmProvider, ToastProvider } from "../../components/ui";
import { TeamPage } from "./TeamPage";

vi.mock("../../auth/AuthProvider", () => ({
  useUser: () => ({ id: "a1", email: "ada@example.com", role: "admin", created_at: "" }),
}));

vi.mock("../../api/resources", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/resources")>();
  return {
    ...actual,
    teamApi: {
      list: vi.fn(),
      invite: vi.fn(),
      reissueInvitation: vi.fn(),
      deactivate: vi.fn(),
      reactivate: vi.fn(),
    },
  };
});

const inTwoDays = new Date(Date.now() + 2 * 86_400_000).toISOString();

const base = {
  title: null,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
  role: "recruiter",
  status: "active",
  deactivated_at: null,
  invitation_expires_at: null,
} as const;

const TEAM: StaffMember[] = [
  { ...base, id: "a1", email: "ada@example.com", full_name: "Ada Admin", role: "admin", title: "Head of Talent" },
  { ...base, id: "r1", email: "sara@example.com", full_name: "Sara Khan" },
  { ...base, id: "r2", email: "omar@example.com", full_name: "Omar Ali", status: "invited", invitation_expires_at: inTwoDays },
  {
    ...base,
    id: "r3",
    email: "lina@example.com",
    full_name: "Lina Park",
    status: "deactivated",
    deactivated_at: "2026-11-05T00:00:00Z",
  },
];

function renderTeam() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ConfirmProvider>
          <MemoryRouter initialEntries={["/team"]}>
            <TeamPage />
          </MemoryRouter>
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const row = (name: string) => screen.getByRole("row", { name: new RegExp(name) });

// Fields are filled by paste: typing key by key is slow enough to time out under the
// full suite.
describe("TeamPage", () => {
  beforeEach(() => {
    vi.mocked(teamApi.list).mockReset().mockResolvedValue({ items: TEAM, total: TEAM.length, limit: 25, offset: 0 });
    vi.mocked(teamApi.invite).mockReset();
    vi.mocked(teamApi.reissueInvitation).mockReset();
    vi.mocked(teamApi.deactivate).mockReset();
  });

  it("lists everyone with their role and status", async () => {
    renderTeam();

    await screen.findByRole("row", { name: /Sara Khan/ });
    expect(within(row("Ada Admin")).getByText("Admin")).toBeInTheDocument();
    expect(within(row("Ada Admin")).getByText("You")).toBeInTheDocument();
    expect(within(row("Sara Khan")).getByText("Active")).toBeInTheDocument();
    expect(within(row("Omar Ali")).getByText("Invited")).toBeInTheDocument();
    expect(within(row("Omar Ali")).getByText(/^Link expires/)).toBeInTheDocument();
    expect(within(row("Lina Park")).getByText("Deactivated")).toBeInTheDocument();
    expect(within(row("Lina Park")).getByRole("button", { name: /Reactivate/ })).toBeInTheDocument();
  });

  it("offers no way to deactivate yourself", async () => {
    renderTeam();
    await screen.findByRole("row", { name: /Sara Khan/ });

    expect(within(row("Ada Admin")).queryByRole("button", { name: /Deactivate/ })).not.toBeInTheDocument();
    expect(within(row("Sara Khan")).getByRole("button", { name: "Deactivate Sara Khan" })).toBeInTheDocument();
  });

  it("adds a recruiter and shows their invitation link once", async () => {
    vi.mocked(teamApi.invite).mockResolvedValue({
      member: { ...base, id: "r9", email: "noor@example.com", full_name: "Noor Aziz", status: "invited" },
      invitation: { token: "tok-new_123", expires_at: inTwoDays },
    });
    const user = userEvent.setup();
    renderTeam();
    await screen.findByRole("row", { name: /Sara Khan/ });

    await user.click(screen.getByRole("button", { name: "Add recruiter" }));
    const form = screen.getByRole("dialog", { name: "Add a recruiter" });
    await user.click(within(form).getByRole("textbox", { name: /Full name/ }));
    await user.paste("Noor Aziz");
    await user.click(within(form).getByRole("textbox", { name: /Work email/ }));
    await user.paste("noor@example.com");
    await user.click(within(form).getByRole("button", { name: "Add recruiter" }));

    expect(teamApi.invite).toHaveBeenCalledWith({ full_name: "Noor Aziz", email: "noor@example.com", title: null });
    const shown = await screen.findByRole("dialog", { name: "Noor Aziz is on the team" });
    expect(within(shown).getByRole("textbox", { name: "Invitation link" })).toHaveValue(
      `${window.location.origin}/invite#tok-new_123`,
    );
    expect(within(shown).getByRole("button", { name: "Copy link" })).toBeInTheDocument();
    expect(within(shown).getByText(/Slack/)).toBeInTheDocument();
    // The list is re-read, so the new person appears in it.
    await waitFor(() => expect(teamApi.list).toHaveBeenCalledTimes(2));

    await user.click(within(shown).getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("textbox", { name: "Invitation link" })).not.toBeInTheDocument();
  });

  it("marks the email when it already has an account", async () => {
    vi.mocked(teamApi.invite).mockRejectedValue(
      new ApiError(409, "duplicate_email", "A user with this email already exists."),
    );
    const user = userEvent.setup();
    renderTeam();
    await screen.findByRole("row", { name: /Sara Khan/ });

    await user.click(screen.getByRole("button", { name: "Add recruiter" }));
    const form = screen.getByRole("dialog", { name: "Add a recruiter" });
    await user.click(within(form).getByRole("textbox", { name: /Full name/ }));
    await user.paste("Sara Again");
    await user.click(within(form).getByRole("textbox", { name: /Work email/ }));
    await user.paste("sara@example.com");
    await user.click(within(form).getByRole("button", { name: "Add recruiter" }));

    const email = within(form).getByRole("textbox", { name: /Work email/ });
    await waitFor(() => expect(email).toHaveAttribute("aria-invalid", "true"));
    expect(email).toHaveAccessibleDescription(/already has a SmartHire account/);
    expect(email).toHaveFocus();
  });

  it("deactivates only after an in-app confirmation", async () => {
    vi.mocked(teamApi.deactivate).mockResolvedValue({ ...TEAM[1]!, status: "deactivated" });
    const user = userEvent.setup();
    renderTeam();
    await screen.findByRole("row", { name: /Sara Khan/ });

    await user.click(screen.getByRole("button", { name: "Deactivate Sara Khan" }));
    const dialog = screen.getByRole("dialog", { name: "Deactivate Sara Khan?" });
    expect(teamApi.deactivate).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Deactivate" }));
    await waitFor(() => expect(teamApi.deactivate).toHaveBeenCalledWith("r1"));
    await waitFor(() => expect(teamApi.list).toHaveBeenCalledTimes(2));
  });

  it("issues a new link for someone still invited", async () => {
    vi.mocked(teamApi.reissueInvitation).mockResolvedValue({ token: "tok-again", expires_at: inTwoDays });
    const user = userEvent.setup();
    renderTeam();
    await screen.findByRole("row", { name: /Sara Khan/ });

    expect(within(row("Sara Khan")).queryByRole("button", { name: /New invite link/ })).not.toBeInTheDocument();
    await user.click(within(row("Omar Ali")).getByRole("button", { name: "New invite link Omar Ali" }));

    expect(teamApi.reissueInvitation).toHaveBeenCalledWith("r2");
    const shown = await screen.findByRole("dialog", { name: "New invitation link for Omar Ali" });
    expect(within(shown).getByRole("textbox", { name: "Invitation link" })).toHaveValue(
      `${window.location.origin}/invite#tok-again`,
    );
  });
});
