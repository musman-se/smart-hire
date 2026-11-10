import { describe, expect, it } from "vitest";

import type { Job } from "../../api/types";
import {
  EMPTY_JOB_FORM,
  JOB_LIMITS,
  changesContent,
  isSameForm,
  jobToFormValues,
  publishChecklist,
  toCreatePayload,
  toUpdatePayload,
  validateJobForm,
  type JobFormValues,
} from "./jobForm";

const valid: JobFormValues = {
  ...EMPTY_JOB_FORM,
  title: "Backend Engineer",
  description: "Build and run the hiring platform's APIs.",
  required_skills: ["python", "sql"],
  min_experience_years: "3",
};

const job: Job = {
  id: "job-1",
  title: "Backend Engineer",
  description: "Build and run the hiring platform's APIs.",
  department: "Engineering",
  location: null,
  employment_type: "contract",
  required_skills: ["python"],
  min_experience_years: 2,
  max_applications: null,
  status: "published",
  published_at: "2026-10-01T10:00:00Z",
  created_at: "2026-09-30T10:00:00Z",
  updated_at: "2026-10-01T10:00:00Z",
};

describe("validateJobForm", () => {
  it("accepts a complete form", () => {
    expect(validateJobForm(valid)).toEqual({});
  });

  it("counts characters as the server does: an emoji is one", () => {
    const title = "\u{1F680}".repeat(JOB_LIMITS.titleMax);
    expect(validateJobForm({ ...valid, title }).title).toBeUndefined();
    expect(validateJobForm({ ...valid, title: `${title}x` }).title).toMatch(/at most/);
  });

  it("caps the required skills at the server's limit", () => {
    const required_skills = Array.from({ length: JOB_LIMITS.skillsMax + 2 }, (_, i) => `s${i}`);
    expect(validateJobForm({ ...valid, required_skills }).required_skills).toBe(
      "List at most 50 skills — remove 2.",
    );
  });

  it("requires a title and description of the server's minimum length", () => {
    const errors = validateJobForm({ ...valid, title: "  ", description: "too short" });
    expect(errors.title).toBe("Title is required.");
    expect(errors.description).toMatch(/at least 10 characters/);
  });

  it("measures length after trimming, as the payload is trimmed", () => {
    expect(validateJobForm({ ...valid, title: "  ab  " }).title).toMatch(/at least 3/);
  });

  it("caps the optional text fields", () => {
    const errors = validateJobForm({
      ...valid,
      department: "x".repeat(JOB_LIMITS.departmentMax + 1),
      location: "x".repeat(JOB_LIMITS.locationMax + 1),
    });
    expect(errors.department).toBeDefined();
    expect(errors.location).toBeDefined();
  });

  it("rejects an over-long skill name", () => {
    const errors = validateJobForm({
      ...valid,
      required_skills: ["x".repeat(JOB_LIMITS.skillMax + 1)],
    });
    expect(errors.required_skills).toBeDefined();
  });

  it.each(["", "-1", "2.5", "51", "abc"])("rejects %j years of experience", (years) => {
    expect(validateJobForm({ ...valid, min_experience_years: years }).min_experience_years).toBeDefined();
  });

  it("treats a blank capacity as unlimited and rejects zero", () => {
    expect(validateJobForm({ ...valid, max_applications: "" }).max_applications).toBeUndefined();
    expect(validateJobForm({ ...valid, max_applications: "0" }).max_applications).toBeDefined();
    expect(validateJobForm({ ...valid, max_applications: "100001" }).max_applications).toBeDefined();
  });
});

describe("toCreatePayload", () => {
  it("trims text, sends blanks as null and converts the numbers", () => {
    expect(
      toCreatePayload({ ...valid, title: " Backend Engineer ", department: "  ", max_applications: "25" }),
    ).toEqual({
      title: "Backend Engineer",
      description: valid.description,
      department: null,
      location: null,
      employment_type: "full_time",
      required_skills: ["python", "sql"],
      min_experience_years: 3,
      max_applications: 25,
    });
  });
});

describe("toUpdatePayload", () => {
  const baseline = jobToFormValues(job);

  it("is empty when nothing changed", () => {
    expect(toUpdatePayload(baseline, baseline)).toEqual({});
  });

  it("sends only the changed fields", () => {
    const patch = toUpdatePayload({ ...baseline, location: "Remote", min_experience_years: "4" }, baseline);
    expect(patch).toEqual({ location: "Remote", min_experience_years: 4 });
  });

  it("sends an explicit null to clear an optional field", () => {
    expect(toUpdatePayload({ ...baseline, department: "" }, baseline)).toEqual({ department: null });
  });

  it("compares skill lists by content, not identity", () => {
    expect(toUpdatePayload({ ...baseline, required_skills: ["python"] }, baseline)).toEqual({});
    expect(
      toUpdatePayload({ ...baseline, required_skills: ["python", "go"] }, baseline),
    ).toEqual({ required_skills: ["python", "go"] });
  });
});

describe("changesContent", () => {
  it("is true only for the fields the publishing workflow analyses", () => {
    expect(changesContent({ description: "New text for the role." })).toBe(true);
    expect(changesContent({ required_skills: [] })).toBe(true);
    expect(changesContent({ location: "Remote", max_applications: 10 })).toBe(false);
  });
});

describe("publishChecklist", () => {
  it("marks required items from validation and recommended ones from presence", () => {
    const items = publishChecklist({ ...valid, location: "Remote" });
    expect(items.filter((item) => item.required).every((item) => item.done)).toBe(true);
    expect(items.find((item) => item.label === "A location")?.done).toBe(true);
    expect(items.find((item) => item.label === "A department")?.done).toBe(false);
  });

  it("flags a missing title and skills on an empty form", () => {
    const items = publishChecklist(EMPTY_JOB_FORM);
    expect(items.find((item) => item.label === "A clear title")?.done).toBe(false);
    expect(items.find((item) => item.label === "Required skills")?.done).toBe(false);
  });

  it("is not complete while a field is invalid", () => {
    const items = publishChecklist({
      ...valid,
      location: "Remote",
      department: "Engineering",
      min_experience_years: "-3",
      max_applications: "0",
    });
    const numbers = items.find((item) => item.label === "Experience and application limit in range");
    expect(numbers).toMatchObject({ done: false, required: true });
    expect(items.every((item) => item.done)).toBe(false);
  });

  it("does not tick a recommended field that is filled in but too long", () => {
    const items = publishChecklist({ ...valid, location: "x".repeat(JOB_LIMITS.locationMax + 1) });
    expect(items.find((item) => item.label === "A location")?.done).toBe(false);
  });
});

describe("jobToFormValues and isSameForm", () => {
  it("round-trips a job into form text", () => {
    const values = jobToFormValues(job);
    expect(values.department).toBe("Engineering");
    expect(values.location).toBe("");
    expect(values.min_experience_years).toBe("2");
    expect(values.max_applications).toBe("");
  });

  it("detects edits, including to the skill list", () => {
    const values = jobToFormValues(job);
    expect(isSameForm(values, jobToFormValues(job))).toBe(true);
    expect(isSameForm(values, { ...values, required_skills: ["python", "go"] })).toBe(false);
    expect(isSameForm(values, { ...values, title: "Other" })).toBe(false);
  });
});
