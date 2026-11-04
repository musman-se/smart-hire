import { describe, expect, it } from "vitest";

import { skillCoverage } from "./content";

describe("skillCoverage", () => {
  const extracted = [
    { name: "docker", mentions: 1 },
    { name: "python", mentions: 4 },
    { name: "aws", mentions: 2 },
  ];

  it("splits what the description mentions into required and other, busiest first", () => {
    const coverage = skillCoverage(["Python", "Docker", "SQL"], extracted);
    expect(coverage.required.map((s) => s.name)).toEqual(["python", "docker"]);
    expect(coverage.other.map((s) => s.name)).toEqual(["aws"]);
  });

  it("lists required skills the text never mentions, in the job's own spelling", () => {
    expect(skillCoverage(["Python", "SQL"], extracted).unmentioned).toEqual(["SQL"]);
  });

  it("handles a job with no required skills", () => {
    const coverage = skillCoverage(null, extracted);
    expect(coverage.required).toEqual([]);
    expect(coverage.other).toHaveLength(3);
    expect(coverage.unmentioned).toEqual([]);
  });
});
