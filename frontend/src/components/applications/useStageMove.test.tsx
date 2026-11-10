import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Application } from "../../api/types";
import { ToastProvider } from "../ui";
import { useStageMove } from "./useStageMove";

const advance = vi.hoisted(() => vi.fn());
vi.mock("../../api/resources", () => ({ applicationsApi: { advance } }));

const application: Application = {
  id: "app-1",
  job_id: "job-1",
  candidate_id: "cand-1",
  stage: "screening",
  cover_letter: "",
  match_score: 80,
  created_at: "2026-11-01T10:00:00Z",
  updated_at: "2026-11-01T10:00:00Z",
};

function Harness({ stage }: { stage: Application["stage"] }) {
  const move = useStageMove();
  return (
    <>
      <button
        type="button"
        onClick={() =>
          move.requestMove({ application, stage, candidateName: "Ayesha Khan", jobTitle: "Backend Engineer" })
        }
      >
        Open
      </button>
      {move.dialog}
    </>
  );
}

async function openDialog(stage: Application["stage"]) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <Harness stage={stage} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  await userEvent.click(screen.getByRole("button", { name: "Open" }));
}

describe("useStageMove", () => {
  it("offers only the moves a recruiter may make, with the requested one chosen", async () => {
    await openDialog("interview");
    const options = screen.getAllByRole("radio").map((radio) => radio.getAttribute("value"));
    // Withdrawing is the candidate's decision, so it is never offered here.
    expect(options).toEqual(["interview", "rejected"]);
    expect(screen.getByRole("radio", { name: "Interview" })).toBeChecked();
  });

  it("rejects with the recruiter's note and closes", async () => {
    advance.mockResolvedValue({ ...application, stage: "rejected" });
    await openDialog("rejected");

    // Pasted, not typed: typing long text key by key times out on a loaded machine.
    await userEvent.click(screen.getByRole("textbox", { name: /reason/i }));
    await userEvent.paste("Needs on-call experience");
    await userEvent.click(screen.getByRole("button", { name: "Reject" }));

    expect(advance).toHaveBeenCalledWith("app-1", "rejected", "Needs on-call experience");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByText("Ayesha Khan was rejected.")).toBeInTheDocument();
  });

  it("keeps the dialog open and explains a refused move", async () => {
    advance.mockRejectedValue(new Error("Network down"));
    await openDialog("interview");

    await userEvent.click(screen.getByRole("button", { name: "Move to Interview" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("cannot be dismissed while the move is in flight, so a refusal is never lost", async () => {
    let refuse!: (error: Error) => void;
    advance.mockReturnValue(new Promise((_, reject) => (refuse = reject)));
    await openDialog("interview");

    await userEvent.click(screen.getByRole("button", { name: "Move to Interview" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /close/i })).toBeNull();

    refuse(new Error("Someone else moved it first"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Someone else moved it first");
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Answered: Escape works again.
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("still reports a refusal when the recruiter has left the page meanwhile", async () => {
    let refuse!: (error: Error) => void;
    advance.mockReturnValue(new Promise((_, reject) => (refuse = reject)));
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });

    function Page({ showBoard }: { showBoard: boolean }) {
      return (
        <QueryClientProvider client={client}>
          <ToastProvider>{showBoard ? <Harness stage="interview" /> : <p>Elsewhere</p>}</ToastProvider>
        </QueryClientProvider>
      );
    }
    const { rerender } = render(<Page showBoard />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await userEvent.click(screen.getByRole("button", { name: "Move to Interview" }));

    // The board goes away (the recruiter navigated), then the server refuses.
    rerender(<Page showBoard={false} />);
    refuse(new Error("Someone else moved it first"));

    expect(await screen.findByText(/Ayesha Khan was not moved/)).toBeInTheDocument();
  });
});
