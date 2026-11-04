import { describe, expect, it } from "vitest";

import { makeCandidate } from "../candidate/fixtures";
import {
  LIMITS,
  isHttpUrl,
  previewCandidate,
  profileChanges,
  validateProfile,
  valuesFromCandidate,
} from "./profileForm";

const baseline = valuesFromCandidate(
  makeCandidate({ headline: "Engineer", years_experience: 2, skills: ["python"] }),
);

describe("valuesFromCandidate", () => {
  it("turns nulls into empty inputs and years into text", () => {
    expect(baseline).toEqual({
      full_name: "Ayesha Khan",
      headline: "Engineer",
      phone: "",
      years_experience: "2",
      skills: ["python"],
      resume_url: "",
    });
  });
});

describe("validateProfile", () => {
  it("accepts the baseline", () => {
    expect(validateProfile(baseline)).toEqual({});
  });

  it("mirrors the server's limits field by field", () => {
    const errors = validateProfile({
      full_name: " A ",
      headline: "x".repeat(LIMITS.headlineMax + 1),
      phone: "1".repeat(LIMITS.phoneMax + 1),
      years_experience: "61",
      skills: ["y".repeat(LIMITS.skillMax + 1)],
      resume_url: "cv.pdf",
    });
    expect(Object.keys(errors).sort()).toEqual(
      ["full_name", "headline", "phone", "resume_url", "skills", "years_experience"].sort(),
    );
  });

  it("wants whole years", () => {
    for (const years of ["", "2.5", "-1", "two"]) {
      expect(validateProfile({ ...baseline, years_experience: years }).years_experience).toBeDefined();
    }
    expect(validateProfile({ ...baseline, years_experience: "0" }).years_experience).toBeUndefined();
  });

  it("allows an empty phone or a dialable one, not letters", () => {
    expect(validateProfile({ ...baseline, phone: "" }).phone).toBeUndefined();
    expect(validateProfile({ ...baseline, phone: "(555) 123-4567" }).phone).toBeUndefined();
    expect(validateProfile({ ...baseline, phone: "abc" }).phone).toMatch(/digits, spaces, \+, -/);
  });

  it("allows an empty resume link but not a non-web one", () => {
    expect(validateProfile({ ...baseline, resume_url: "" }).resume_url).toBeUndefined();
    expect(validateProfile({ ...baseline, resume_url: "ftp://x.org/cv" }).resume_url).toBeDefined();
  });
});

describe("isHttpUrl", () => {
  it("accepts http and https links only", () => {
    expect(isHttpUrl("https://example.com/cv.pdf")).toBe(true);
    expect(isHttpUrl("http://example.com")).toBe(true);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("example.com")).toBe(false);
  });
});

describe("profileChanges", () => {
  it("is empty when nothing changed, ignoring surrounding whitespace", () => {
    expect(profileChanges(baseline, { ...baseline, full_name: " Ayesha Khan " })).toEqual({});
  });

  it("sends only what changed, with cleared text as null", () => {
    expect(
      profileChanges(baseline, { ...baseline, headline: "  ", phone: " +1 555 ", years_experience: "5" }),
    ).toEqual({ headline: null, phone: "+1 555", years_experience: 5 });
  });

  it("compares skills the way the server stores them", () => {
    expect(profileChanges(baseline, { ...baseline, skills: [" Python "] })).toEqual({});
    expect(profileChanges(baseline, { ...baseline, skills: ["python", "SQL"] })).toEqual({
      skills: ["python", "sql"],
    });
  });
});

describe("previewCandidate", () => {
  const saved = makeCandidate({ full_name: "Ayesha Khan", years_experience: 2 });

  it("shows the unsaved values the way the server would store them", () => {
    const preview = previewCandidate(saved, {
      ...valuesFromCandidate(saved),
      headline: "  Data engineer ",
      skills: ["SQL"],
      years_experience: "7",
    });
    expect(preview).toMatchObject({ headline: "Data engineer", skills: ["sql"], years_experience: 7 });
  });

  it("never renders a broken card mid-edit", () => {
    const preview = previewCandidate(saved, {
      ...valuesFromCandidate(saved),
      full_name: "  ",
      years_experience: "",
      phone: "",
    });
    expect(preview).toMatchObject({ full_name: "Ayesha Khan", years_experience: 0, phone: null });
  });

  it("does not count a resume link that would fail validation", () => {
    const withLink = (resume_url: string) =>
      previewCandidate(saved, { ...valuesFromCandidate(saved), resume_url }).resume_url;
    expect(withLink("not a url")).toBeNull();
    expect(withLink(`https://example.com/${"a".repeat(LIMITS.resumeUrlMax)}`)).toBeNull();
    expect(withLink(" https://example.com/cv.pdf ")).toBe("https://example.com/cv.pdf");
  });
});
