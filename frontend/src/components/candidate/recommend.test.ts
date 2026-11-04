import { describe, expect, it } from "vitest";

import { makeJob } from "./fixtures";
import { recommendJobs } from "./recommend";

const profile = { skills: ["python", "sql", "docker"], years_experience: 4 };
const none = new Set<string>();

describe("recommendJobs", () => {
  it("ranks by share of required skills matched", () => {
    const partial = makeJob({ id: "partial", required_skills: ["python", "go"] });
    const full = makeJob({ id: "full", required_skills: ["Python", "SQL"] });
    const ids = recommendJobs(profile, [partial, full], none).map((r) => r.job.id);
    expect(ids).toEqual(["full", "partial"]);
  });

  it("puts a job that lists no skills below a strong match, above a weak one", () => {
    const open = makeJob({ id: "open", required_skills: [] });
    const strong = makeJob({ id: "strong", required_skills: ["python", "sql"] });
    const weak = makeJob({ id: "weak", required_skills: ["python", "go", "rust", "java"] });
    const ids = recommendJobs(profile, [weak, open, strong], none).map((r) => r.job.id);
    expect(ids).toEqual(["strong", "open", "weak"]);
  });

  it("leaves out jobs the server would refuse, already applied to, or not open", () => {
    const tooSenior = makeJob({ id: "senior", min_experience_years: 8 });
    const noOverlap = makeJob({ id: "rust", required_skills: ["rust"] });
    const applied = makeJob({ id: "applied" });
    const closed = makeJob({ id: "closed", status: "closed" });
    const ok = makeJob({ id: "ok" });
    const ids = recommendJobs(profile, [tooSenior, noOverlap, applied, closed, ok], new Set(["applied"]));
    expect(ids.map((r) => r.job.id)).toEqual(["ok"]);
  });

  it("explains each pick in the candidate's terms", () => {
    const [pick] = recommendJobs(
      profile,
      [makeJob({ required_skills: ["python", "sql", "go"], min_experience_years: 3 })],
      none,
    );
    expect(pick?.reasons).toEqual(["Matches 2 of 3 skills", "You meet the 3+ years asked"]);

    const [all] = recommendJobs(profile, [makeJob({ required_skills: ["python", "sql"] })], none);
    expect(all?.reasons[0]).toBe("Matches all 2 required skills");
  });

  it("breaks ties with the newest posting", () => {
    const older = makeJob({ id: "older", published_at: "2026-09-01T00:00:00Z" });
    const newer = makeJob({ id: "newer", published_at: "2026-10-01T00:00:00Z" });
    expect(recommendJobs(profile, [older, newer], none).map((r) => r.job.id)).toEqual(["newer", "older"]);
  });

  it("returns at most `limit`", () => {
    const jobs = Array.from({ length: 10 }, (_, i) => makeJob({ id: `j${i}` }));
    expect(recommendJobs(profile, jobs, none, 3)).toHaveLength(3);
  });
});
