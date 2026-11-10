/**
 * The candidate profile form as plain data: what the inputs hold, what is valid, and
 * what a save should send. The limits mirror CandidateUpdate in the backend
 * (app/candidates/schemas.py), so a bad value is caught under its field instead of
 * coming back as a 422 for the whole form.
 */

import { MAX_SKILLS, type Candidate, type CandidateUpdate } from "../../api/types";
import { looksLikePhone } from "../../lib/phone";
import { FULL_NAME_LIMITS, codePointLength } from "../auth/validation";

export const LIMITS = {
  fullNameMin: FULL_NAME_LIMITS.min,
  fullNameMax: FULL_NAME_LIMITS.max,
  headlineMax: 200,
  phoneMax: 32,
  yearsMax: 60,
  skillMax: 64,
  skillsMax: MAX_SKILLS,
  resumeUrlMax: 500,
} as const;

/** Text inputs hold strings — years included, so the box can be empty while typing. */
export interface ProfileValues {
  full_name: string;
  headline: string;
  phone: string;
  years_experience: string;
  skills: string[];
  resume_url: string;
}

export type ProfileErrors = Partial<Record<keyof ProfileValues, string>>;

/** The server lowercases and trims skills; doing the same here means a saved form is
 * not dirty again the moment the answer comes back. */
export const normalizeSkill = (skill: string) => skill.trim().toLowerCase();

export function valuesFromCandidate(candidate: Candidate): ProfileValues {
  return {
    full_name: candidate.full_name,
    headline: candidate.headline ?? "",
    phone: candidate.phone ?? "",
    years_experience: String(candidate.years_experience),
    skills: candidate.skills ?? [],
    resume_url: candidate.resume_url ?? "",
  };
}

/**
 * A full web address: http or https, with a host — the backend's rule for a resume
 * link. Anything else is never rendered as a link either, so a stored "javascript:"
 * or "data:" value cannot run when clicked.
 */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname !== "";
  } catch {
    return false;
  }
}

export function validateProfile(values: ProfileValues): ProfileErrors {
  const errors: ProfileErrors = {};

  // Trimmed first, as the server does: a name of spaces is no name.
  const name = codePointLength(values.full_name.trim());
  if (name < LIMITS.fullNameMin) errors.full_name = "Enter your full name.";
  else if (name > LIMITS.fullNameMax) {
    errors.full_name = `Keep it under ${LIMITS.fullNameMax} characters.`;
  }

  if (codePointLength(values.headline.trim()) > LIMITS.headlineMax) {
    errors.headline = `Keep it under ${LIMITS.headlineMax} characters.`;
  }
  if (codePointLength(values.phone.trim()) > LIMITS.phoneMax) {
    errors.phone = `Keep it under ${LIMITS.phoneMax} characters.`;
  } else if (!looksLikePhone(values.phone)) {
    errors.phone = "Enter a phone number (digits, spaces, +, -), like +92 300 1234567.";
  }

  const years = values.years_experience.trim();
  if (!/^\d+$/.test(years) || Number(years) > LIMITS.yearsMax) {
    errors.years_experience = `Enter a whole number from 0 to ${LIMITS.yearsMax}.`;
  }

  const longSkill = values.skills.find((skill) => codePointLength(skill) > LIMITS.skillMax);
  if (values.skills.length > LIMITS.skillsMax) {
    errors.skills = `List at most ${LIMITS.skillsMax} skills — remove ${values.skills.length - LIMITS.skillsMax}.`;
  } else if (longSkill) {
    errors.skills = `"${longSkill.slice(0, 20)}…" is too long — skills are at most ${LIMITS.skillMax} characters.`;
  }

  const url = values.resume_url.trim();
  if (url && !isHttpUrl(url)) {
    errors.resume_url = "Enter a full link starting with https://";
  } else if (codePointLength(url) > LIMITS.resumeUrlMax) {
    errors.resume_url = `Links are at most ${LIMITS.resumeUrlMax} characters.`;
  }

  return errors;
}

/** Empty optional text is sent as null — "remove it" — not as an empty string. */
const optional = (value: string) => value.trim() || null;

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((item, index) => item === b[index]);

/**
 * The PATCH body: only fields whose value differs from the baseline. Sending the
 * whole form would overwrite a change made in another tab with a stale value.
 * Expects valid values (see validateProfile).
 */
export function profileChanges(baseline: ProfileValues, values: ProfileValues): CandidateUpdate {
  const changes: CandidateUpdate = {};

  if (values.full_name.trim() !== baseline.full_name.trim()) {
    changes.full_name = values.full_name.trim();
  }
  for (const key of ["headline", "phone", "resume_url"] as const) {
    if (optional(values[key]) !== optional(baseline[key])) changes[key] = optional(values[key]);
  }
  if (Number(values.years_experience) !== Number(baseline.years_experience)) {
    changes.years_experience = Number(values.years_experience);
  }
  const skills = values.skills.map(normalizeSkill);
  if (!sameList(skills, baseline.skills.map(normalizeSkill))) changes.skills = skills;

  return changes;
}

/**
 * The profile as it would read after saving the form now — for the live preview and
 * the strength meter beside the form. Unparseable years read as 0, a blank name falls
 * back to the saved one, and a phone or resume link that would not pass validation
 * reads as absent, so the preview never shows a broken card or credits a value that
 * cannot be saved.
 */
export function previewCandidate(saved: Candidate, values: ProfileValues): Candidate {
  const years = Number(values.years_experience);
  const errors = validateProfile(values);
  return {
    ...saved,
    full_name: values.full_name.trim() || saved.full_name,
    headline: optional(values.headline),
    phone: errors.phone ? null : optional(values.phone),
    years_experience: Number.isInteger(years) && years >= 0 ? years : 0,
    skills: values.skills.map(normalizeSkill),
    resume_url: errors.resume_url ? null : optional(values.resume_url),
  };
}

/** Field order on the page, for focusing the first invalid one on submit. */
export const FIELD_ORDER = [
  "full_name",
  "headline",
  "phone",
  "years_experience",
  "skills",
  "resume_url",
] as const satisfies readonly (keyof ProfileValues)[];
