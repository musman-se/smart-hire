import { describe, expect, it } from "vitest";

import type { Application, ApplicationStage, Job } from "../../api/types";
import {
  applicationsByJob,
  buildBoard,
  countActive,
  hasBoardFilters,
  postedAt,
  type BoardFilters,
} from "./jobBoard";

function makeJob(id: string, overrides: Partial<Job> = {}): Job {
  return {
    id,
    title: `Job ${id}`,
    description: "A role worth applying to.",
    department: null,
    location: null,
    employment_type: "full_time",
    required_skills: [],
    min_experience_years: 0,
    max_applications: null,
    status: "published",
    published_at: "2026-10-01T00:00:00Z",
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

function makeApplication(
  jobId: string,
  stage: ApplicationStage = "applied",
  createdAt = "2026-10-02T00:00:00Z",
): Application {
  return {
    id: `app-${jobId}-${createdAt}`,
    job_id: jobId,
    candidate_id: "me",
    stage,
    cover_letter: null,
    match_score: null,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

const NO_FILTERS: BoardFilters = {
  type: "",
  location: "",
  eligibleOnly: false,
  hideApplied: false,
  sort: "newest",
};

const profile = { years_experience: 3, skills: ["python", "sql"] };

const jobs = [
  makeJob("old-fit", {
    published_at: "2026-09-01T00:00:00Z",
    required_skills: ["python", "sql"],
    location: "Lahore",
  }),
  makeJob("new-partial", {
    published_at: "2026-10-20T00:00:00Z",
    required_skills: ["python", "go", "rust"],
    employment_type: "contract",
    location: "Remote",
  }),
  makeJob("mid-senior", {
    published_at: "2026-10-10T00:00:00Z",
    required_skills: ["python"],
    min_experience_years: 8,
  }),
];

const ids = (entries: { job: Job }[]) => entries.map((entry) => entry.job.id);

describe("postedAt", () => {
  it("prefers the publish date and falls back to creation", () => {
    expect(postedAt(makeJob("a"))).toBe("2026-10-01T00:00:00Z");
    expect(postedAt(makeJob("b", { published_at: null }))).toBe("2026-09-01T00:00:00Z");
  });
});

describe("applicationsByJob and countActive", () => {
  it("keys applications by job, keeping the newest", () => {
    const older = makeApplication("j1", "withdrawn", "2026-10-01T00:00:00Z");
    const newer = makeApplication("j1", "screening", "2026-10-05T00:00:00Z");
    const map = applicationsByJob([newer, older, makeApplication("j2")]);
    expect(map.get("j1")).toBe(newer);
    expect(map.size).toBe(2);
  });

  it("counts only non-terminal applications toward the cap", () => {
    const applications = (["applied", "interview", "hired", "rejected", "withdrawn"] as const).map(
      (stage) => makeApplication(stage, stage),
    );
    expect(countActive(applications)).toBe(2);
  });
});

describe("buildBoard", () => {
  it("sorts newest first by publish date", () => {
    expect(ids(buildBoard(jobs, profile, new Map(), NO_FILTERS))).toEqual([
      "new-partial",
      "mid-senior",
      "old-fit",
    ]);
  });

  it("puts eligible roles first, then by share of matched skills, for best match", () => {
    const board = buildBoard(jobs, profile, new Map(), { ...NO_FILTERS, sort: "match" });
    expect(ids(board)).toEqual(["old-fit", "new-partial", "mid-senior"]);
    expect(board[0]?.fit?.match.ratio).toBe(1);
    expect(board[2]?.fit?.eligible).toBe(false);
  });

  it("falls back to newest when there is no profile to match against", () => {
    const board = buildBoard(jobs, null, new Map(), { ...NO_FILTERS, sort: "match" });
    expect(ids(board)).toEqual(["new-partial", "mid-senior", "old-fit"]);
    expect(board.every((entry) => entry.fit === null)).toBe(true);
  });

  it("filters by employment type and by location text, case-insensitively", () => {
    expect(ids(buildBoard(jobs, profile, new Map(), { ...NO_FILTERS, type: "contract" }))).toEqual([
      "new-partial",
    ]);
    expect(ids(buildBoard(jobs, profile, new Map(), { ...NO_FILTERS, location: " remo " }))).toEqual([
      "new-partial",
    ]);
  });

  it("hides ineligible roles only when there is a profile to judge by", () => {
    const filters = { ...NO_FILTERS, eligibleOnly: true };
    expect(ids(buildBoard(jobs, profile, new Map(), filters))).not.toContain("mid-senior");
    expect(buildBoard(jobs, undefined, new Map(), filters)).toHaveLength(3);
  });

  it("attaches the candidate's application and can hide applied roles", () => {
    const applied = applicationsByJob([makeApplication("old-fit", "interview")]);
    const board = buildBoard(jobs, profile, applied, NO_FILTERS);
    expect(board.find((entry) => entry.job.id === "old-fit")?.application?.stage).toBe("interview");
    expect(
      ids(buildBoard(jobs, profile, applied, { ...NO_FILTERS, hideApplied: true })),
    ).not.toContain("old-fit");
  });

  it("does not reorder the caller's array", () => {
    const input = [...jobs];
    buildBoard(input, profile, new Map(), { ...NO_FILTERS, sort: "match" });
    expect(input).toEqual(jobs);
  });
});

describe("hasBoardFilters", () => {
  it("ignores the sort order, which is not a filter", () => {
    expect(hasBoardFilters({ ...NO_FILTERS, sort: "match", search: "", skill: "" })).toBe(false);
    expect(hasBoardFilters({ ...NO_FILTERS, search: "", skill: "go" })).toBe(true);
    expect(hasBoardFilters({ ...NO_FILTERS, hideApplied: true, search: "", skill: "" })).toBe(true);
  });
});
