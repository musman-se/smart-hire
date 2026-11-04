import { describe, expect, it } from "vitest";

import type { Application, Candidate } from "../../api/types";
import {
  applicantName,
  buildBoard,
  canDrop,
  columnOf,
  countByStage,
  describeMove,
  groupByColumn,
  matchesFilters,
  sortApplications,
  withStage,
} from "./model";

function application(overrides: Partial<Application> = {}): Application {
  return {
    id: "a1",
    job_id: "j1",
    candidate_id: "c1",
    stage: "applied",
    cover_letter: null,
    match_score: null,
    created_at: "2026-11-01T10:00:00Z",
    updated_at: "2026-11-01T10:00:00Z",
    ...overrides,
  };
}

const candidate = {
  id: "c1",
  email: "ayesha@example.com",
  full_name: "Ayesha Khan",
  headline: "Backend engineer",
  years_experience: 4,
  skills: ["python"],
} as Candidate;

describe("columns and drops", () => {
  it("puts rejected and withdrawn in the closed lane", () => {
    expect(columnOf("rejected")).toBe("closed");
    expect(columnOf("withdrawn")).toBe("closed");
    expect(columnOf("interview")).toBe("interview");
  });

  it("accepts only the next stage, or the closed lane as a rejection", () => {
    expect(canDrop("applied", "screening")).toBe(true);
    expect(canDrop("applied", "interview")).toBe(false);
    expect(canDrop("applied", "applied")).toBe(false);
    expect(canDrop("interview", "closed")).toBe(true);
    expect(canDrop("rejected", "closed")).toBe(false);
  });

  it("groups applications by column, keeping their order", () => {
    const groups = groupByColumn([
      application({ id: "1", stage: "applied" }),
      application({ id: "2", stage: "withdrawn" }),
      application({ id: "3", stage: "applied" }),
    ]);
    expect(groups.applied.map((a) => a.id)).toEqual(["1", "3"]);
    expect(groups.closed.map((a) => a.id)).toEqual(["2"]);
    expect(groups.hired).toEqual([]);
  });

  it("counts every stage, zeros included", () => {
    const counts = countByStage([application(), application({ stage: "offer" })]);
    expect(counts.applied).toBe(1);
    expect(counts.offer).toBe(1);
    expect(counts.rejected).toBe(0);
  });
});

describe("matchesFilters", () => {
  it("searches name, email and headline, ignoring case", () => {
    expect(matchesFilters(application(), candidate, { search: "KHAN", minScore: 0 })).toBe(true);
    expect(matchesFilters(application(), candidate, { search: "backend", minScore: 0 })).toBe(true);
    expect(matchesFilters(application(), candidate, { search: "frontend", minScore: 0 })).toBe(false);
  });

  it("hides unscored applications once a minimum score is set", () => {
    expect(matchesFilters(application(), candidate, { search: "", minScore: 0 })).toBe(true);
    expect(matchesFilters(application(), candidate, { search: "", minScore: 50 })).toBe(false);
    expect(matchesFilters(application({ match_score: 72 }), candidate, { search: "", minScore: 50 })).toBe(
      true,
    );
  });

  it("does not match a search while the candidate is still loading", () => {
    expect(matchesFilters(application(), undefined, { search: "ayesha", minScore: 0 })).toBe(false);
  });
});

describe("sortApplications", () => {
  const older = application({ id: "old", match_score: 80, created_at: "2026-10-01T00:00:00Z" });
  const newer = application({ id: "new", match_score: 80, created_at: "2026-11-01T00:00:00Z" });
  const unscored = application({ id: "none", match_score: null, created_at: "2026-11-02T00:00:00Z" });
  const best = application({ id: "best", match_score: 95, created_at: "2026-09-01T00:00:00Z" });

  it("orders by score, unscored last and newest first among equals", () => {
    const ids = sortApplications([unscored, older, best, newer], "score").map((a) => a.id);
    expect(ids).toEqual(["best", "new", "old", "none"]);
  });

  it("orders by date either way without touching the input", () => {
    const input = [older, unscored, newer];
    expect(sortApplications(input, "newest").map((a) => a.id)).toEqual(["none", "new", "old"]);
    expect(sortApplications(input, "oldest").map((a) => a.id)).toEqual(["old", "new", "none"]);
    expect(input.map((a) => a.id)).toEqual(["old", "none", "new"]);
  });
});

describe("withStage", () => {
  it("moves one application and leaves the others as they were", () => {
    const keep = application({ id: "keep" });
    const page = { items: [application({ id: "move" }), keep], total: 2, limit: 100, offset: 0 };
    const next = withStage(page, "move", "screening");
    expect(next.items[0]?.stage).toBe("screening");
    expect(next.items[1]).toBe(keep);
    expect(page.items[0]?.stage).toBe("applied");
  });
});

describe("describeMove", () => {
  it("reads naturally for each kind of move", () => {
    expect(describeMove("Ayesha", "interview")).toBe("Ayesha moved to Interview.");
    expect(describeMove("Ayesha", "rejected")).toBe("Ayesha was rejected.");
    expect(describeMove("Ayesha", "hired")).toBe("Ayesha was hired.");
  });
});

describe("applicantName", () => {
  it("prefers the name, then the email, then a neutral fallback", () => {
    expect(applicantName(candidate)).toBe("Ayesha Khan");
    expect(applicantName({ full_name: " ", email: "a@x.io" })).toBe("a@x.io");
    expect(applicantName(undefined)).toBe("This applicant");
  });
});

describe("buildBoard", () => {
  it("filters and orders each column, and still counts everything", () => {
    const other = { ...candidate, id: "c2", full_name: "Bilal Ahmed", email: "bilal@example.com" } as Candidate;
    const byId = new Map([
      ["c1", candidate],
      ["c2", other],
    ]);
    const board = buildBoard(
      [
        application({ id: "low", candidate_id: "c1", match_score: 40 }),
        application({ id: "high", candidate_id: "c1", match_score: 90 }),
        application({ id: "bilal", candidate_id: "c2", match_score: 99 }),
        application({ id: "gone", candidate_id: "c1", stage: "rejected" }),
      ],
      byId,
      { search: "ayesha", minScore: 0 },
      "score",
    );
    expect(board.columns.applied.map((a) => a.id)).toEqual(["high", "low"]);
    expect(board.totals.applied).toBe(3);
    expect(board.columns.closed.map((a) => a.id)).toEqual(["gone"]);
    expect(board.totals.screening).toBe(0);
  });
});
