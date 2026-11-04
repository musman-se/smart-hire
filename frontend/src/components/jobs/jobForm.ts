/**
 * The job editor's form model: values as the inputs hold them (numbers as text, so a
 * half-typed field is not coerced to 0), validation that mirrors the backend, and the
 * mapping to the API's create and update payloads.
 */

import type { EmploymentType, Job, JobCreate, JobUpdate } from "../../api/types";

/**
 * Mirrors backend/app/jobs/schemas.py and models.py. The browser counts UTF-16 units
 * and the server characters, so an emoji costs two here: the form can only be stricter
 * than the server, never looser.
 */
export const JOB_LIMITS = {
  titleMin: 3,
  titleMax: 200,
  descriptionMin: 10,
  descriptionMax: 20_000,
  departmentMax: 100,
  locationMax: 120,
  skillMax: 64,
  experienceMax: 50,
  capacityMax: 100_000,
} as const;

export interface JobFormValues {
  title: string;
  description: string;
  department: string;
  location: string;
  employment_type: EmploymentType;
  required_skills: string[];
  min_experience_years: string;
  max_applications: string;
}

export type JobFormField = keyof JobFormValues;
export type JobFormErrors = Partial<Record<JobFormField, string>>;

/** Field order on screen — the first invalid one is where focus goes on submit. */
export const JOB_FORM_FIELDS: readonly JobFormField[] = [
  "title",
  "department",
  "location",
  "employment_type",
  "description",
  "required_skills",
  "min_experience_years",
  "max_applications",
];

export const EMPTY_JOB_FORM: JobFormValues = {
  title: "",
  description: "",
  department: "",
  location: "",
  employment_type: "full_time",
  required_skills: [],
  min_experience_years: "0",
  max_applications: "",
};

export function jobToFormValues(job: Job): JobFormValues {
  return {
    title: job.title,
    description: job.description,
    department: job.department ?? "",
    location: job.location ?? "",
    employment_type: job.employment_type,
    required_skills: [...(job.required_skills ?? [])],
    min_experience_years: String(job.min_experience_years ?? 0),
    max_applications: job.max_applications == null ? "" : String(job.max_applications),
  };
}

const WHOLE_NUMBER = /^\d+$/;

function lengthError(value: string, label: string, min: number, max: number): string | undefined {
  const length = value.trim().length;
  if (length === 0) return `${label} is required.`;
  if (length < min) return `${label} needs at least ${min} characters.`;
  if (length > max) return `${label} can be at most ${max.toLocaleString()} characters.`;
  return undefined;
}

function maxLengthError(value: string, label: string, max: number): string | undefined {
  return value.trim().length > max ? `${label} can be at most ${max} characters.` : undefined;
}

export function validateJobForm(values: JobFormValues): JobFormErrors {
  const errors: JobFormErrors = {};
  const set = (field: JobFormField, message: string | undefined) => {
    if (message) errors[field] = message;
  };

  set("title", lengthError(values.title, "Title", JOB_LIMITS.titleMin, JOB_LIMITS.titleMax));
  set(
    "description",
    lengthError(
      values.description,
      "Description",
      JOB_LIMITS.descriptionMin,
      JOB_LIMITS.descriptionMax,
    ),
  );
  set("department", maxLengthError(values.department, "Department", JOB_LIMITS.departmentMax));
  set("location", maxLengthError(values.location, "Location", JOB_LIMITS.locationMax));

  const longSkill = values.required_skills.find((skill) => skill.length > JOB_LIMITS.skillMax);
  if (longSkill) {
    set("required_skills", `Skill names can be at most ${JOB_LIMITS.skillMax} characters.`);
  }

  const years = values.min_experience_years.trim();
  if (!WHOLE_NUMBER.test(years) || Number(years) > JOB_LIMITS.experienceMax) {
    set("min_experience_years", `Enter whole years from 0 to ${JOB_LIMITS.experienceMax}.`);
  }

  const capacity = values.max_applications.trim();
  if (
    capacity !== "" &&
    (!WHOLE_NUMBER.test(capacity) || Number(capacity) < 1 || Number(capacity) > JOB_LIMITS.capacityMax)
  ) {
    set(
      "max_applications",
      `Enter a number from 1 to ${JOB_LIMITS.capacityMax.toLocaleString()}, or leave it blank.`,
    );
  }

  return errors;
}

export interface ChecklistItem {
  label: string;
  done: boolean;
  /** Required items block saving; the rest only make the posting better. */
  required: boolean;
}

/**
 * What the editor's preview lists before publishing. The recommended items are the
 * ones candidates rely on: without skills, anyone can apply and every match reads 100%.
 * An item is done only when its field is both filled in and valid, so the list never
 * reads as complete while the form shows an error.
 */
export function publishChecklist(values: JobFormValues): ChecklistItem[] {
  const errors = validateJobForm(values);
  const filled = (field: "location" | "department") =>
    values[field].trim() !== "" && !errors[field];
  return [
    { label: "A clear title", done: !errors.title, required: true },
    {
      label: `A description of at least ${JOB_LIMITS.descriptionMin} characters`,
      done: !errors.description,
      required: true,
    },
    {
      label: "Experience and application limit in range",
      done: !errors.min_experience_years && !errors.max_applications,
      required: true,
    },
    {
      label: "Required skills",
      done: values.required_skills.length > 0 && !errors.required_skills,
      required: false,
    },
    { label: "A location", done: filled("location"), required: false },
    { label: "A department", done: filled("department"), required: false },
  ];
}

/** Blank optional text is "not set" (null), never an empty string the API would keep. */
const optionalText = (value: string) => value.trim() || null;

/** Assumes validated values. */
export function toCreatePayload(values: JobFormValues): JobCreate {
  const capacity = values.max_applications.trim();
  return {
    title: values.title.trim(),
    description: values.description.trim(),
    department: optionalText(values.department),
    location: optionalText(values.location),
    employment_type: values.employment_type,
    required_skills: values.required_skills,
    min_experience_years: Number(values.min_experience_years),
    max_applications: capacity === "" ? null : Number(capacity),
  };
}

/**
 * Only the fields that differ from `baseline`. PATCH leaves unsent fields alone, and
 * sending an unchanged title would still re-run content analysis on a published job.
 */
export function toUpdatePayload(values: JobFormValues, baseline: JobFormValues): JobUpdate {
  const next = toCreatePayload(values);
  const before = toCreatePayload(baseline);
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(next) as (keyof JobCreate)[]) {
    if (!sameValue(next[key], before[key])) patch[key] = next[key];
  }
  return patch as JobUpdate;
}

/** The fields the publishing workflow analyses (CONTENT_FIELDS in the backend's
 * publishing service): changing any of them on a published job re-runs it. */
const CONTENT_FIELDS = ["title", "description", "required_skills"] as const;

export function changesContent(patch: JobUpdate): boolean {
  return CONTENT_FIELDS.some((field) => field in patch);
}

export function isSameForm(a: JobFormValues, b: JobFormValues): boolean {
  return (Object.keys(a) as JobFormField[]).every((key) => sameValue(a[key], b[key]));
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => item === b[index]);
  }
  return a === b;
}
