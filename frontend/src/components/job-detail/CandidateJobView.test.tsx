import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { applicationsApi, candidatesApi } from "../../api/resources";
import type { Application, Job } from "../../api/types";
import { makeApplication, makeCandidate, makeJob } from "../candidate/fixtures";
import { ConfirmProvider, ToastProvider } from "../ui";
import { CandidateJobView } from "./CandidateJobView";

vi.mock("../../api/resources", () => ({
  candidatesApi: { get: vi.fn() },
  applicationsApi: { list: vi.fn(), history: vi.fn(), notifications: vi.fn() },
}));

function renderView(job: Job, mine: Application[]) {
  vi.mocked(applicationsApi.list).mockResolvedValue({ items: mine, total: mine.length, limit: 100, offset: 0 });
  render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ToastProvider>
          <ConfirmProvider>
            <CandidateJobView job={job} candidateId="cand-1" />
          </ConfirmProvider>
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("CandidateJobView header jump to the apply panel", () => {
  beforeEach(() => {
    vi.mocked(candidatesApi.get).mockResolvedValue(makeCandidate());
    vi.mocked(applicationsApi.history).mockResolvedValue([]);
    vi.mocked(applicationsApi.notifications).mockResolvedValue([]);
  });

  it("offers Apply on an open job, linking to the panel", async () => {
    renderView(makeJob(), []);
    const jump = await screen.findByRole("link", { name: "Apply" });
    expect(jump).toHaveAttribute("href", "#apply");
    expect(screen.getByRole("complementary", { name: "Your application" })).toHaveAttribute("id", "apply");
  });

  it("points to the application once the candidate has applied", async () => {
    renderView(makeJob(), [makeApplication()]);
    expect(await screen.findByRole("link", { name: "Your application" })).toHaveAttribute("href", "#apply");
    expect(screen.queryByRole("link", { name: "Apply" })).not.toBeInTheDocument();
  });

  it("offers nothing on a closed job the candidate never applied to", async () => {
    renderView(makeJob({ status: "closed" }), []);
    expect(await screen.findByText("Not accepting applications")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Apply" })).not.toBeInTheDocument();
  });
});
