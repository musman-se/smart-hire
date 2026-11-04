import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { jobsApi } from "../../api/resources";
import type { JobStatus } from "../../api/types";
import { useJob } from "../../hooks/queries";
import { makeJob } from "../candidate/fixtures";
import { ConfirmProvider, ToastProvider } from "../ui";
import { JobActions } from "./JobActions";

vi.mock("../../api/resources", () => ({ jobsApi: { get: vi.fn(), publish: vi.fn() } }));

const draft = makeJob({ status: "draft", published_at: null });

/** The header as the job page wires it: fed by the job query, which a publish invalidates. */
function Header() {
  const { data: job } = useJob(draft.id);
  return job ? <JobActions job={job} applicationCount={0} onShowPublishing={() => {}} /> : null;
}

/** Publishes the draft. Each later read of the job finds the workflow at the next of
 * `statuses`, and the last one holds. */
async function publishAndSettle(...statuses: JobStatus[]) {
  const reads = [draft, ...statuses.map((status) => ({ ...draft, status }))];
  vi.mocked(jobsApi.get).mockImplementation(async () => (reads.length > 1 ? reads.shift() : reads[0]) ?? draft);
  vi.mocked(jobsApi.publish).mockResolvedValue({ ...draft, status: "processing" });
  render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ToastProvider>
          <ConfirmProvider>
            <Header />
          </ConfirmProvider>
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  await userEvent.click(await screen.findByRole("button", { name: "Publish" }));
}

describe("JobActions publish toast", () => {
  beforeEach(() => vi.clearAllMocks());

  it("says the job is live when the workflow finished before the page caught up", async () => {
    await publishAndSettle("published");
    expect(await screen.findByText("Job published")).toBeInTheDocument();
    expect(screen.queryByText("Publishing started")).not.toBeInTheDocument();
  });

  it("offers to watch progress while the workflow is still running", async () => {
    await publishAndSettle("processing");
    expect(await screen.findByText("Publishing started")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Watch progress" })).toBeInTheDocument();
  });

  it("replaces the started toast with the outcome once the job goes live", async () => {
    await publishAndSettle("processing", "published");
    expect(await screen.findByText("Publishing started")).toBeInTheDocument();
    // The job page polls a processing job every second.
    expect(await screen.findByText("Job published", undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByText("Publishing started")).not.toBeInTheDocument();
  });

  it("reports a failure that happened before the page caught up", async () => {
    await publishAndSettle("publish_failed");
    expect(await screen.findByText("Publishing failed")).toBeInTheDocument();
  });
});
