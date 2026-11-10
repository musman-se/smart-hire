import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Role } from "../api/types";
import { NAV_ITEMS, ROLE_HOME } from "../components/navigation";
import { RequireRole, RoleHome, RoleSwitch } from "./RequireRole";
import { canSee, isAdmin, isStaff } from "./roles";

const user = { id: "u1", email: "ada@example.com", role: "admin" as Role, created_at: "" };

vi.mock("./AuthProvider", () => ({ useUser: () => user }));

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<RoleHome />} />
        <Route path="/dashboard" element={<p>Dashboard</p>} />
        <Route path="/home" element={<p>Candidate home</p>} />
        <Route
          path="/candidates"
          element={
            <RequireRole role="staff">
              <p>Candidate directory</p>
            </RequireRole>
          }
        />
        <Route
          path="/team"
          element={
            <RequireRole role="admin">
              <p>Team page</p>
            </RequireRole>
          }
        />
        <Route
          path="/applications"
          element={<RoleSwitch staff={<p>Review queue</p>} candidate={<p>My applications</p>} />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("roles", () => {
  it("counts admins and recruiters as staff, and only admins as admins", () => {
    expect([isStaff("admin"), isStaff("recruiter"), isStaff("candidate")]).toEqual([true, true, false]);
    expect([isAdmin("admin"), isAdmin("recruiter"), isAdmin("candidate")]).toEqual([true, false, false]);
    expect(canSee("admin", "candidate")).toBe(false);
  });

  it("gives an admin the recruiter's pages plus the team page", () => {
    expect(ROLE_HOME.admin).toBe(ROLE_HOME.recruiter);
    const paths = (role: Role) => NAV_ITEMS[role].map((item) => item.to);
    expect(paths("admin")).toEqual([...paths("recruiter"), "/team"]);
    expect(paths("recruiter")).not.toContain("/team");
  });
});

describe("role guards", () => {
  beforeEach(() => {
    user.role = "admin";
  });

  it("sends an admin home to the dashboard", () => {
    renderAt("/");
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("lets an admin into staff pages and the team page", () => {
    renderAt("/candidates");
    expect(screen.getByText("Candidate directory")).toBeInTheDocument();
  });

  it("shows an admin the review queue, not a candidate's applications", () => {
    renderAt("/applications");
    expect(screen.getByText("Review queue")).toBeInTheDocument();
  });

  it("opens the team page for an admin", () => {
    renderAt("/team");
    expect(screen.getByText("Team page")).toBeInTheDocument();
  });

  it("sends a recruiter away from the team page, to their dashboard", () => {
    user.role = "recruiter";
    renderAt("/team");
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.queryByText("Team page")).not.toBeInTheDocument();
  });

  it("keeps candidates out of staff pages", () => {
    user.role = "candidate";
    renderAt("/candidates");
    expect(screen.getByText("Candidate home")).toBeInTheDocument();
  });
});
