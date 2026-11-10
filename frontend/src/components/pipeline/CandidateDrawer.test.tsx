import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../api/client";
import type { Application, Candidate, Job } from "../../api/types";
import { ToastProvider } from "../ui";
import { CandidateDrawer } from "./CandidateDrawer";

const api = vi.hoisted(() => ({ candidateGet: vi.fn() }));

vi.mock("../../api/resources", () => ({
  candidatesApi: { get: api.candidateGet },
  applicationsApi: {
    get: vi.fn(),
    history: vi.fn(async () => []),
    notifications: vi.fn(async () => []),
    process: vi.fn(),
  },
  jobsApi: { content: vi.fn() },
}));

const job = {
  id: "j1",
  title: "Backend Engineer",
  department: null,
  required_skills: [],
  content_processed_at: null,
} as unknown as Job;

const application = {
  id: "a1",
  job_id: "j1",
  candidate_id: "c1",
  stage: "screening",
  cover_letter: null,
  match_score: 70,
  created_at: "2026-11-01T10:00:00Z",
  updated_at: "2026-11-01T10:00:00Z",
} as Application;

const candidate = (resume_url: string | null) =>
  ({
    id: "c1",
    email: "ayesha@example.com",
    full_name: "Ayesha Khan",
    phone: null,
    headline: null,
    years_experience: 4,
    skills: [],
    resume_url,
    created_at: "2026-10-01T10:00:00Z",
    updated_at: "2026-10-01T10:00:00Z",
  }) as Candidate;

function renderDrawer() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter>
          <CandidateDrawer
            job={job}
            applicationId="a1"
            application={application}
            onClose={vi.fn()}
            onRequestMove={vi.fn()}
          />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("CandidateDrawer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("links a web resume", async () => {
    api.candidateGet.mockResolvedValue(candidate("https://cv.example.com/ayesha.pdf"));
    renderDrawer();
    expect(await screen.findByRole("link", { name: /Resume/ })).toHaveAttribute(
      "href",
      "https://cv.example.com/ayesha.pdf",
    );
  });

  it("shows any other stored value as text, never as a link that could run", async () => {
    api.candidateGet.mockResolvedValue(candidate("javascript:alert(1)"));
    renderDrawer();
    expect(await screen.findByText("javascript:alert(1)")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Resume/ })).toBeNull();
  });

  it("says why the profile did not load and offers a retry, instead of skeletons for ever", async () => {
    api.candidateGet.mockRejectedValueOnce(new ApiError(500, "internal_error", "Database hiccup"));
    renderDrawer();

    expect(await screen.findByText("Database hiccup")).toBeInTheDocument();

    api.candidateGet.mockResolvedValue(candidate(null));
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: "ayesha@example.com" })).toBeInTheDocument();
  });
});
