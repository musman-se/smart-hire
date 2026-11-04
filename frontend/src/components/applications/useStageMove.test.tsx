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

    await userEvent.type(screen.getByRole("textbox", { name: /reason/i }), "Needs on-call experience");
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
});
