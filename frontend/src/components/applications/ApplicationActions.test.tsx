import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { applicationsApi } from "../../api/resources";
import type { Application } from "../../api/types";
import { ToastProvider } from "../ui";
import { ApplicationActions } from "./ApplicationActions";

vi.mock("../../api/resources", () => ({ applicationsApi: { advance: vi.fn(), process: vi.fn() } }));

const application: Application = {
  id: "app-1",
  job_id: "job-1",
  candidate_id: "cand-1",
  stage: "applied",
  cover_letter: "",
  match_score: 64,
  created_at: "2026-11-01T10:00:00Z",
  updated_at: "2026-11-01T10:00:00Z",
};

function renderInRow(stage: Application["stage"] = "applied") {
  const onRowClick = vi.fn();
  render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <table>
            <tbody>
              <tr onClick={onRowClick}>
                <td>
                  <ApplicationActions
                    application={{ ...application, stage }}
                    candidateName="Ayesha Khan"
                    jobTitle="Backend Engineer"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return { onRowClick };
}

describe("ApplicationActions", () => {
  it("offers the next stage as a one-click move", () => {
    renderInRow("screening");
    expect(screen.getByRole("button", { name: "Move to Interview" })).toBeInTheDocument();
  });

  it("confirms a hire in the dialog instead of moving straight away", async () => {
    renderInRow("offer");
    await userEvent.click(screen.getByRole("button", { name: "Move to Hired" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(applicationsApi.advance).not.toHaveBeenCalled();
  });

  it("offers no step forward once an application is closed", () => {
    renderInRow("rejected");
    expect(screen.queryByRole("button", { name: /^Move to/ })).not.toBeInTheDocument();
  });

  it("keeps clicks in its dialog from reaching the table row", async () => {
    const { onRowClick } = renderInRow();
    await userEvent.click(screen.getByRole("button", { name: /More actions/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: /Reject/ }));
    // The dialog is portaled out of the row, but React bubbles its events through it.
    await userEvent.click(screen.getByRole("textbox", { name: /reason/i }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
