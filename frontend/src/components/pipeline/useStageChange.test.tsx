import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { applicationsApi } from "../../api/resources";
import type { Application, ApplicationStage, Page } from "../../api/types";
import { keys } from "../../hooks/queries";
import { ToastProvider } from "../ui";
import { stageChangeAnchor, useStageChange } from "./useStageChange";

vi.mock("../../api/resources", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/resources")>();
  return { ...actual, applicationsApi: { ...actual.applicationsApi, advance: vi.fn() } };
});

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

const COLUMNS: ApplicationStage[] = ["applied", "screening"];

/** Two columns of cards, each card a "Move to…" button marked as the move's anchor. A
 * card that changes column is a new element, as on the real board. */
function Board() {
  const { data } = useQuery<Page<Application>>({
    queryKey: keys.jobApplications("j1"),
    queryFn: () => new Promise(() => {}),
    staleTime: Infinity,
  });
  const stageChange = useStageChange("j1", () => "Ayesha Khan");
  return (
    <>
      {COLUMNS.map((stage) => (
        <section key={stage} aria-label={stage}>
          {data?.items
            .filter((item) => item.stage === stage)
            .map((item) => (
              <button
                key={item.id}
                type="button"
                {...stageChangeAnchor(item.id)}
                onClick={() => stageChange.requestMove(item, "screening")}
              >
                Move Ayesha
              </button>
            ))}
        </section>
      ))}
      {stageChange.dialog}
    </>
  );
}

function renderBoard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData<Page<Application>>(keys.jobApplications("j1"), {
    items: [application],
    total: 1,
    limit: 100,
    offset: 0,
  });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <Board />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const card = (column: ApplicationStage) =>
  within(screen.getByRole("region", { name: column })).getByRole("button", { name: "Move Ayesha" });

async function moveToScreening() {
  const user = userEvent.setup();
  card("applied").focus();
  await user.keyboard("{Enter}");
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: /Screening/ }));
}

describe("useStageChange", () => {
  it("hands focus to the moved card in its new column", async () => {
    vi.mocked(applicationsApi.advance).mockResolvedValue({ ...application, stage: "screening" });
    renderBoard();

    await moveToScreening();

    await waitFor(() => expect(card("screening")).toHaveFocus());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("follows the card back when the server refuses the move", async () => {
    let refuse: (error: Error) => void = () => {};
    vi.mocked(applicationsApi.advance).mockReturnValue(
      new Promise((_resolve, reject) => {
        refuse = reject;
      }),
    );
    renderBoard();

    await moveToScreening();
    // The early update moved the card, and focus with it...
    await waitFor(() => expect(card("screening")).toHaveFocus());
    // ...and the rollback brings both back.
    refuse(new Error("Moved by someone else"));

    await waitFor(() => expect(card("applied")).toHaveFocus());
    expect(within(screen.getByRole("region", { name: "screening" })).queryByRole("button")).toBeNull();
  });
});
