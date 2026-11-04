import { describe, expect, it } from "vitest";

import { makeCandidate } from "../candidate/fixtures";
import { MIN_SKILLS, profileCompleteness, profileFieldHref } from "./completeness";

describe("profileCompleteness", () => {
  it("starts a new profile at zero", () => {
    const result = profileCompleteness(makeCandidate());
    expect(result).toMatchObject({ done: 0, total: 5, ratio: 0 });
    expect(result.items.every((item) => !item.done)).toBe(true);
  });

  it("is complete once every item is filled in", () => {
    const result = profileCompleteness(
      makeCandidate({
        headline: "Data engineer",
        phone: "+92 300 0000000",
        years_experience: 3,
        skills: ["python", "sql", "dbt"],
        resume_url: "https://example.com/cv.pdf",
      }),
    );
    expect(result).toMatchObject({ done: 5, ratio: 1 });
  });

  it("does not count whitespace as filled in", () => {
    const result = profileCompleteness(makeCandidate({ headline: "   " }));
    expect(result.items.find((item) => item.key === "headline")?.done).toBe(false);
  });

  it(`wants at least ${MIN_SKILLS} skills, and says how many there are so far`, () => {
    const skills = profileCompleteness(makeCandidate({ skills: ["python"] })).items.find(
      (item) => item.key === "skills",
    );
    expect(skills?.done).toBe(false);
    expect(skills?.hint).toMatch(/^1 so far/);
  });
});

describe("profileFieldHref", () => {
  it("points at the field on the profile page", () => {
    expect(profileFieldHref("resume_url")).toBe("/profile#resume_url");
  });
});
