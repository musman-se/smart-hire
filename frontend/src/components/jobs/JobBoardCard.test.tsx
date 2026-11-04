import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import type { Application, Job } from "../../api/types";
import { eligibility } from "../../lib/match";
import { JobBoardCard } from "./JobBoardCard";
import type { BoardEntry } from "./jobBoard";

const job: Job = {
  id: "job-1",
  title: "Data Engineer",
  description: "Pipelines.",
  department: "Data",
  location: "Remote",
  employment_type: "contract",
  required_skills: ["python", "spark", "sql", "airflow"],
  min_experience_years: 5,
  max_applications: null,
  status: "published",
  published_at: "2026-10-01T00:00:00Z",
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
};

function entry(profile: { years_experience: number; skills: string[] }, application: Application | null = null): BoardEntry {
  return { job, fit: eligibility(profile, job), application };
}

function renderCard(boardEntry: BoardEntry, { profileHasSkills = true, atCap = false } = {}) {
  render(
    <MemoryRouter>
      <JobBoardCard entry={boardEntry} layout="grid" profileHasSkills={profileHasSkills} atCap={atCap} />
    </MemoryRouter>,
  );
}

describe("JobBoardCard", () => {
  it("links the title to the job and shows the skill match", () => {
    renderCard(entry({ years_experience: 6, skills: ["python", "sql"] }));
    expect(screen.getByRole("link", { name: "Data Engineer" })).toHaveAttribute("href", "/jobs/job-1");
    expect(screen.getByText("50% skill match")).toBeInTheDocument();
    expect(screen.getByText("You can apply")).toBeInTheDocument();
  });

  it("does not promise an application while the candidate is at the active cap", () => {
    renderCard(entry({ years_experience: 6, skills: ["python", "sql"] }), { atCap: true });
    expect(screen.getByText("Eligible · at your application limit")).toBeInTheDocument();
    expect(screen.queryByText("You can apply")).not.toBeInTheDocument();
  });

  it("explains why the candidate cannot apply yet", () => {
    renderCard(entry({ years_experience: 2, skills: ["python"] }));
    expect(screen.getByText("Not eligible yet")).toBeInTheDocument();
    expect(screen.getByText("Needs 5+ years of experience (has 2).")).toBeInTheDocument();
  });

  it("shows the application's stage instead of eligibility once applied", () => {
    const application: Application = {
      id: "app-1",
      job_id: "job-1",
      candidate_id: "me",
      stage: "interview",
      cover_letter: null,
      match_score: null,
      created_at: "2026-10-02T00:00:00Z",
      updated_at: "2026-10-03T00:00:00Z",
    };
    renderCard(entry({ years_experience: 2, skills: [] }, application));
    expect(screen.getByText("Applied · Interviewing")).toBeInTheDocument();
    expect(screen.queryByText(/years of experience/)).not.toBeInTheDocument();
  });

  it("asks for skills rather than showing a meaningless 0% match", () => {
    renderCard(entry({ years_experience: 6, skills: [] }), { profileHasSkills: false });
    expect(screen.getByText("Add skills to see your match")).toBeInTheDocument();
    expect(screen.queryByText(/skill match/)).not.toBeInTheDocument();
  });
});
