import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { ShortcutsDialog } from "../components/ShortcutsDialog";
import { NotFoundPage } from "./NotFoundPage";

const user = { id: "u1", email: "cara@example.com", role: "candidate", created_at: "" };

vi.mock("../auth/AuthProvider", () => ({ useUser: () => user }));

describe("NotFoundPage", () => {
  it("names the missing address and offers a way home", () => {
    render(
      <MemoryRouter initialEntries={["/jobz?x=1"]}>
        <NotFoundPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("This page doesn’t exist");
    expect(screen.getByText("/jobz?x=1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /go home/i })).toHaveAttribute("href", "/home");
    // Opened straight onto the bad link: "back" would leave the app, so it is not offered.
    expect(screen.queryByRole("button", { name: /go back/i })).not.toBeInTheDocument();
    expect(document.title).toMatch(/page not found/i);
  });
});

describe("ShortcutsDialog", () => {
  it("lists the role's shortcuts in groups", () => {
    render(
      <MemoryRouter>
        <ShortcutsDialog open onClose={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Go to" })).toBeInTheDocument();
    expect(screen.getByText("My applications")).toBeInTheDocument();
    // Candidates cannot create jobs, so the recruiter-only group is absent.
    expect(screen.queryByText("Create a job")).not.toBeInTheDocument();
  });
});
