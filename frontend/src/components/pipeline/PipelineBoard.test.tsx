import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Application, Candidate, Job } from "../../api/types";
import { buildBoard, type BoardColumn } from "./model";
import { PipelineBoard } from "./PipelineBoard";

const job = {
  id: "j1",
  title: "Backend Engineer",
  required_skills: ["python", "sql"],
  min_experience_years: 2,
} as Job;

const candidate = {
  id: "c1",
  email: "ayesha@example.com",
  full_name: "Ayesha Khan",
  headline: "Backend engineer",
  years_experience: 4,
  skills: ["python"],
} as Candidate;

const application = {
  id: "a1",
  job_id: "j1",
  candidate_id: "c1",
  stage: "applied",
  cover_letter: null,
  match_score: 72,
  created_at: "2026-11-01T10:00:00Z",
  updated_at: "2026-11-01T10:00:00Z",
} as Application;

function renderBoard(
  onRequestMove = vi.fn(),
  onOpen = vi.fn(),
  serverTotals?: Partial<Record<BoardColumn, number>>,
) {
  const candidates = new Map([["c1", candidate]]);
  const { columns, totals } = buildBoard([application], candidates, { search: "", minScore: 0 }, "score");
  render(
    <PipelineBoard
      job={job}
      columns={columns}
      totals={totals}
      serverTotals={serverTotals}
      candidatesById={candidates}
      showClosed
      onShowClosedChange={vi.fn()}
      pendingIds={new Set()}
      onOpen={onOpen}
      onRequestMove={onRequestMove}
    />,
  );
  return { onRequestMove, onOpen };
}

const column = (name: string) => screen.getByRole("heading", { name }).closest("section") as HTMLElement;

function dataTransfer() {
  return { setData: vi.fn(), effectAllowed: "", dropEffect: "" };
}

describe("PipelineBoard", () => {
  it("opens a valid drop zone only on the stages a card may move to", () => {
    const { onRequestMove } = renderBoard();
    const card = screen.getByRole("button", { name: "Ayesha Khan" }).closest("li") as HTMLElement;

    fireEvent.dragStart(card, { dataTransfer: dataTransfer() });
    expect(column("Screening")).toHaveAttribute("data-drop", "valid");
    expect(column("Closed")).toHaveAttribute("data-drop", "valid");
    expect(column("Interview")).toHaveAttribute("data-drop", "invalid");
    expect(column("Applied")).toHaveAttribute("data-drop", "invalid");

    // A drop on an invalid stage does nothing; a valid one asks to move.
    fireEvent.drop(column("Interview"), { dataTransfer: dataTransfer() });
    expect(onRequestMove).not.toHaveBeenCalled();

    fireEvent.dragStart(card, { dataTransfer: dataTransfer() });
    fireEvent.drop(column("Closed"), { dataTransfer: dataTransfer() });
    expect(onRequestMove).toHaveBeenCalledWith(application, "rejected");
    expect(column("Screening")).not.toHaveAttribute("data-drop");
  });

  it("offers the same moves from the keyboard", async () => {
    const user = userEvent.setup();
    const { onRequestMove } = renderBoard();

    await user.click(screen.getByRole("button", { name: "Move Ayesha Khan or open details" }));
    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: /Move to Screening/ })).toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: /Interview/ })).not.toBeInTheDocument();

    await user.click(within(menu).getByRole("menuitem", { name: /Reject/ }));
    expect(onRequestMove).toHaveBeenCalledWith(application, "rejected");
  });

  it("opens the drawer from anywhere on the card, but not from its menu", async () => {
    const user = userEvent.setup();
    const { onOpen } = renderBoard();

    await user.click(screen.getByRole("button", { name: "Move Ayesha Khan or open details" }));
    expect(onOpen).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");

    await user.click(screen.getByText("Backend engineer"));
    expect(onOpen).toHaveBeenCalledWith(application);
  });

  it("shows how the card matches the job", () => {
    renderBoard();
    const card = screen.getByRole("button", { name: "Ayesha Khan" }).closest("li") as HTMLElement;
    expect(within(card).getByText("python")).toHaveClass("tag", "match");
    expect(within(card).getByText("1 missing")).toBeInTheDocument();
    expect(within(card).getByRole("img", { name: "Match score 72 of 100" })).toBeInTheDocument();
  });

  it("counts a column against the server's total when the board holds only part of it", () => {
    renderBoard(vi.fn(), vi.fn(), { applied: 212, screening: 0 });
    const header = within(column("Applied")).getByText("1 of 212");
    expect(header.closest(".pipeline-column-count")).toHaveTextContent("1 of 212 applications shown (latest only)");
    // A column the board holds in full keeps its plain count.
    expect(within(column("Screening")).getByText("0")).toBeInTheDocument();
  });
});
