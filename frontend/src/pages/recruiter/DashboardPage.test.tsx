import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApplicationFilters, JobFilters } from "../../api/resources";
import type { Application, Candidate, Job } from "../../api/types";
import { ToastProvider } from "../../components/ui";
import { DashboardPage } from "./DashboardPage";

const api = vi.hoisted(() => ({
  jobsList: vi.fn(),
  jobsGet: vi.fn(),
  jobsPublish: vi.fn(),
  applicationsList: vi.fn(),
  candidatesGet: vi.fn(),
}));

vi.mock("../../api/resources", () => ({
  jobsApi: { list: api.jobsList, get: api.jobsGet, publish: api.jobsPublish },
  applicationsApi: { list: api.applicationsList, process: vi.fn() },
  candidatesApi: { get: api.candidatesGet },
  skillsApi: { list: vi.fn() },
  healthApi: { ready: vi.fn() },
}));

vi.mock("../../auth/AuthProvider", () => ({
  useUser: () => ({ id: "u1", email: "sara.khan@example.com", role: "recruiter", created_at: "" }),
}));

const DAY = 24 * 60 * 60 * 1000;

function page<T>(items: T[], total = items.length) {
  return Promise.resolve({ items, total, limit: 100, offset: 0 });
}

const failedJob = {
  id: "job-f",
  title: "Data Engineer",
  description: "",
  employment_type: "full_time",
  required_skills: [],
  min_experience_years: 0,
  status: "publish_failed",
  publish_error: "Content service timed out",
  published_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
} as unknown as Job;

const openJob = { ...failedJob, id: "job-a", title: "Backend Engineer", status: "published", publish_error: null } as Job;

const waitingApplication = {
  id: "app-1",
  job_id: "job-a",
  candidate_id: "cand-1",
  stage: "applied",
  cover_letter: "",
  match_score: 82,
  created_at: new Date(Date.now() - 5 * DAY).toISOString(),
  updated_at: new Date(Date.now() - 5 * DAY).toISOString(),
} as Application;

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("DashboardPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the way to a first job in an empty workspace", async () => {
    api.jobsList.mockImplementation(() => page([]));
    api.applicationsList.mockImplementation(() => page([]));

    renderPage();

    expect(await screen.findByRole("heading", { name: "Post your first job" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/, Sara$/);
    expect(screen.queryByText("Needs attention")).not.toBeInTheDocument();
  });

  it("lists what needs attention and retries a failed publish", async () => {
    api.jobsList.mockImplementation((filters: JobFilters) => {
      if (filters.status === "publish_failed") return page([failedJob]);
      if (filters.status === "published") return page([openJob]);
      return page([], 0);
    });
    api.applicationsList.mockImplementation((filters: ApplicationFilters) => {
      if (filters.limit === 1) return page([], filters.stage === "applied" || !filters.stage ? 1 : 0);
      return page([waitingApplication]);
    });
    api.jobsGet.mockImplementation((id: string) => Promise.resolve(id === "job-a" ? openJob : failedJob));
    api.candidatesGet.mockResolvedValue({ id: "cand-1", full_name: "Omar Farooq" } as Candidate);
    api.jobsPublish.mockResolvedValue({ ...failedJob, status: "processing" });

    renderPage();

    const attention = await screen.findByRole("list", { name: "Items needing attention" });
    expect(within(attention).getByText(/failed to publish/)).toBeInTheDocument();
    expect(within(attention).getByText("Content service timed out")).toBeInTheDocument();
    expect(await within(attention).findByText(/waiting in Applied for/)).toBeInTheDocument();

    await userEvent.click(within(attention).getByRole("button", { name: /Retry publish/ }));
    expect(api.jobsPublish).toHaveBeenCalledWith("job-f");

    // The activity feed names the candidate and the job it resolved by id.
    expect(await screen.findByRole("link", { name: "Omar Farooq" })).toHaveAttribute("href", "/candidates/cand-1");
  });
});
