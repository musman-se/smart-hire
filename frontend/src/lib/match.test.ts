import { describe, expect, it } from "vitest";

import { eligibility, skillMatch } from "./match";

describe("skillMatch", () => {
  it("matches case-insensitively, keeping the job's spelling", () => {
    const match = skillMatch(["Python", "SQL"], ["python", "kafka", "sql"]);
    expect(match.matched).toEqual(["python", "sql"]);
    expect(match.missing).toEqual(["kafka"]);
    expect(match.ratio).toBeCloseTo(2 / 3);
  });

  it("treats a job with no required skills as a full match", () => {
    expect(skillMatch(["python"], [])).toEqual({ matched: [], missing: [], ratio: 1 });
  });

  it("does not double-count a skill the job lists twice", () => {
    expect(skillMatch(["go"], ["Go", "go"]).ratio).toBe(1);
  });

  it("copes with missing lists", () => {
    expect(skillMatch(undefined, ["python"])).toEqual({
      matched: [],
      missing: ["python"],
      ratio: 0,
    });
  });
});

describe("eligibility", () => {
  const job = { min_experience_years: 3, required_skills: ["python", "sql"] };

  it("is eligible with enough experience and one overlapping skill", () => {
    const result = eligibility({ years_experience: 5, skills: ["SQL"] }, job);
    expect(result.eligible).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("reports every failed rule, not just the first", () => {
    const result = eligibility({ years_experience: 1, skills: ["java"] }, job);
    expect(result.eligible).toBe(false);
    expect(result.reasons).toHaveLength(2);
    expect(result.reasons[0]).toMatch(/3\+ years/);
    expect(result.reasons[1]).toMatch(/python, sql/);
  });

  it("only needs the experience rule when the job lists no skills", () => {
    const open = { min_experience_years: 0, required_skills: [] };
    expect(eligibility({ years_experience: 0, skills: [] }, open).eligible).toBe(true);
  });
});
