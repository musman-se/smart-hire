import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Role } from "../api/types";
import { ThemeProvider } from "../hooks/useTheme";
import { CommandPalette } from "./CommandPalette";

const user = { id: "u1", email: "rita@example.com", role: "recruiter" as Role, created_at: "" };

vi.mock("../auth/AuthProvider", () => ({
  useUser: () => user,
  useAuth: () => ({ signOut: vi.fn() }),
}));

const page = <T,>(items: T[]) => ({ items, total: items.length, limit: 5, offset: 0 });

const job = {
  id: "j1",
  title: "Backend Engineer",
  status: "published",
  department: "Platform",
  location: "Remote",
  employment_type: "full_time",
};

vi.mock("../api/resources", () => ({
  jobsApi: {
    list: vi.fn(async () => page([job])),
    // Landing on /jobs/:id records it as recent, which reads the job detail.
    get: vi.fn(async () => job),
  },
  candidatesApi: { list: vi.fn(async () => page([])), get: vi.fn() },
  applicationsApi: { list: vi.fn(async () => ({ ...page([]), total: 3 })) },
}));

function Where() {
  const location = useLocation();
  return <output data-testid="where">{location.pathname + location.search}</output>;
}

function Harness({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        open
      </button>
      <CommandPalette
        open={open}
        onClose={() => {
          setOpen(false);
          onClose();
        }}
        onShowShortcuts={() => {}}
      />
    </>
  );
}

function renderPalette(onClose?: () => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Routes>
            <Route path="*" element={<><Harness onClose={onClose} /><Where /></>} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

const where = () => screen.getByTestId("where").textContent;

describe("CommandPalette", () => {
  beforeEach(() => {
    user.role = "recruiter";
  });
  afterEach(() => vi.clearAllMocks());

  it("focuses the search box and highlights the first result", () => {
    renderPalette();
    const input = screen.getByRole("combobox");
    expect(input).toHaveFocus();
    const first = screen.getAllByRole("option")[0]!;
    expect(input).toHaveAttribute("aria-activedescendant", first.id);
    expect(first).toHaveAttribute("aria-selected", "true");
  });

  it("moves with the arrow keys and opens the selection with Enter", async () => {
    const actor = userEvent.setup();
    renderPalette();
    await actor.keyboard("{End}");
    const options = screen.getAllByRole("option");
    expect(options.at(-1)).toHaveAttribute("aria-selected", "true");
    await actor.keyboard("{ArrowDown}");
    expect(options[0]).toHaveAttribute("aria-selected", "true");

    await actor.type(screen.getByRole("combobox"), "cand");
    await actor.keyboard("{Enter}");
    expect(where()).toBe("/candidates");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("filters fuzzily and highlights the matched characters", async () => {
    const actor = userEvent.setup();
    renderPalette();
    await actor.type(screen.getByRole("combobox"), "dsh");
    // By text content: jsdom treats <mark> as a block, which splits the accessible name.
    const option = screen.getAllByRole("option").find((o) => o.textContent?.startsWith("Dashboard"));
    const marked = Array.from(option?.querySelectorAll("mark") ?? [], (mark) => mark.textContent);
    expect(marked).toEqual(["D", "sh"]);
  });

  it("clears the search on the first Escape and closes on the second", async () => {
    const actor = userEvent.setup();
    const onClose = vi.fn();
    renderPalette(onClose);
    const input = screen.getByRole("combobox");
    await actor.type(input, "jobs");
    await actor.keyboard("{Escape}");
    expect(input).toHaveValue("");
    expect(onClose).not.toHaveBeenCalled();
    await actor.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("searches jobs on the server and opens a result", async () => {
    const actor = userEvent.setup();
    renderPalette();
    await actor.type(screen.getByRole("combobox"), "backend");
    const option = await screen.findByRole("option", { name: /backend engineer/i });
    await actor.click(option);
    expect(where()).toBe("/jobs/j1");
  });

  it("offers recruiter-only commands to recruiters only", async () => {
    const { unmount } = renderPalette();
    expect(screen.getByRole("option", { name: /create a job/i })).toBeInTheDocument();
    expect(await screen.findByText("3 new")).toBeInTheDocument();
    unmount();

    user.role = "candidate";
    renderPalette();
    expect(screen.queryByRole("option", { name: /create a job/i })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /edit your profile/i })).toBeInTheDocument();
  });

  it("binds n to a new job for recruiters while the palette is closed", async () => {
    const actor = userEvent.setup();
    renderPalette();
    await actor.keyboard("{Escape}");
    await actor.keyboard("n");
    await waitFor(() => expect(where()).toBe("/jobs/new"));
  });
});
