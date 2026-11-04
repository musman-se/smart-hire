import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Job } from "../../api/types";
import { JobMeta } from "./JobMeta";
import { OverviewTab } from "./OverviewTab";

const published: Job = {
  id: "job-1",
  title: "Frontend Engineer",
  description: "Build the console.",
  department: "Engineering",
  location: "Remote",
  employment_type: "full_time",
  required_skills: ["react"],
  min_experience_years: 2,
  max_applications: null,
  status: "published",
  published_at: "2026-10-01T00:00:00Z",
  created_at: "2026-09-30T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
};
const closed: Job = { ...published, status: "closed", updated_at: "2026-10-20T00:00:00Z" };

function renderOverview(job: Job) {
  render(<OverviewTab job={job} applications={[]} total={0} onShowStage={vi.fn()} />);
}

describe("OverviewTab intake note", () => {
  it("says an uncapped live job takes applications until it is closed", () => {
    renderOverview(published);
    expect(screen.getByText(/No cap: the job takes applications until you close it/)).toBeInTheDocument();
  });

  it("says a closed job no longer takes applications, capped or not", () => {
    renderOverview(closed);
    expect(screen.getByText(/no longer takes applications/)).toBeInTheDocument();
    expect(screen.queryByText(/No cap/)).not.toBeInTheDocument();
  });

  it("says a closed job is closed even under its cap", () => {
    renderOverview({ ...closed, max_applications: 50 });
    expect(screen.getByText(/no longer takes applications/)).toBeInTheDocument();
    expect(screen.queryByText(/the cap counts every application/)).not.toBeInTheDocument();
  });

  it("says a draft does not take applications yet", () => {
    renderOverview({ ...published, status: "draft", published_at: null });
    expect(screen.getByText(/once the job is published/)).toBeInTheDocument();
  });
});

describe("JobMeta for a recruiter", () => {
  it("dates a closed job by its close, not its publish", () => {
    render(<JobMeta job={closed} audience="recruiter" />);
    expect(screen.getByText(/^Closed /)).toBeInTheDocument();
    expect(screen.queryByText(/^Published /)).not.toBeInTheDocument();
  });

  it("dates a live job by its publish", () => {
    render(<JobMeta job={published} audience="recruiter" />);
    expect(screen.getByText(/^Published /)).toBeInTheDocument();
  });
});
