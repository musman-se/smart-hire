import { describe, expect, it } from "vitest";

import { explainScore, scoreIsStale, scoreVerdict } from "./scoreExplain";

const job = { required_skills: ["Python", "SQL"], min_experience_years: 4 };

describe("explainScore", () => {
  it("weighs the three factors as the server does", () => {
    const { factors, estimate } = explainScore(
      { skills: ["python", "docker"], years_experience: 2 },
      job,
      ["python", "sql", "docker", "kubernetes"],
    );
    expect(factors.map((f) => f.share)).toEqual([0.5, 0.5, 0.5]);
    // 0.6 * 0.5 + 0.25 * 0.5 + 0.15 * 0.5
    expect(estimate).toBe(50);
  });

  it("counts a factor with nothing to measure in full", () => {
    const { factors, estimate } = explainScore(
      { skills: [], years_experience: 0 },
      { required_skills: [], min_experience_years: 0 },
      [],
    );
    expect(factors.every((f) => f.share === 1)).toBe(true);
    expect(estimate).toBe(100);
  });

  it("caps experience at the minimum", () => {
    const { factors } = explainScore({ skills: [], years_experience: 12 }, job, []);
    expect(factors.find((f) => f.key === "experience")?.share).toBe(1);
  });

  it("leaves the estimate open until the description's skills are known", () => {
    const { factors, estimate } = explainScore({ skills: ["python"], years_experience: 4 }, job, undefined);
    expect(factors.find((f) => f.key === "other")?.share).toBeNull();
    expect(estimate).toBeNull();
  });
});

describe("scoreIsStale", () => {
  it("flags a stored score that no longer matches the profile", () => {
    expect(scoreIsStale(80, 50)).toBe(true);
    expect(scoreIsStale(50.4, 50)).toBe(false);
    expect(scoreIsStale(null, 50)).toBe(false);
    expect(scoreIsStale(80, null)).toBe(false);
  });
});

describe("scoreVerdict", () => {
  it("uses the same bands as the score ring", () => {
    expect(scoreVerdict(90)).toBe("Strong match");
    expect(scoreVerdict(50)).toBe("Fair match");
    expect(scoreVerdict(10)).toBe("Weak match");
    expect(scoreVerdict(null)).toBe("Not scored yet");
  });
});
