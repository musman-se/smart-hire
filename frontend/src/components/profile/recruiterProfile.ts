/**
 * The recruiter's own profile — the name and title they go by — as plain data. Mirrors
 * RecruiterUpdate in the backend (app/recruiters/schemas.py): the name is trimmed and
 * then 2–160 characters, the title at most 100, and a blank title means "none".
 */

import type { RecruiterProfile, RecruiterUpdate } from "../../api/types";
import { FULL_NAME_LIMITS, codePointLength, type FieldErrors } from "../auth/validation";

export const RECRUITER_LIMITS = {
  fullNameMin: FULL_NAME_LIMITS.min,
  fullNameMax: FULL_NAME_LIMITS.max,
  titleMax: 100,
} as const;

export interface RecruiterProfileValues {
  full_name: string;
  title: string;
}

export type RecruiterProfileField = keyof RecruiterProfileValues;

export const RECRUITER_PROFILE_ORDER = ["full_name", "title"] as const satisfies readonly RecruiterProfileField[];

export function valuesFromProfile(profile: RecruiterProfile): RecruiterProfileValues {
  return { full_name: profile.full_name, title: profile.title ?? "" };
}

export function validateRecruiterProfile(
  values: RecruiterProfileValues,
): FieldErrors<RecruiterProfileField> {
  const errors: FieldErrors<RecruiterProfileField> = {};
  const name = codePointLength(values.full_name.trim());
  if (name === 0) errors.full_name = "Enter your full name";
  else if (name < RECRUITER_LIMITS.fullNameMin) {
    errors.full_name = `Use at least ${RECRUITER_LIMITS.fullNameMin} characters`;
  } else if (name > RECRUITER_LIMITS.fullNameMax) {
    errors.full_name = `Use ${RECRUITER_LIMITS.fullNameMax} characters or fewer`;
  }
  if (codePointLength(values.title.trim()) > RECRUITER_LIMITS.titleMax) {
    errors.title = `Use ${RECRUITER_LIMITS.titleMax} characters or fewer`;
  }
  return errors;
}

/** The PATCH body: only what changed, trimmed, a blank title sent as null. */
export function recruiterProfileChanges(
  saved: RecruiterProfile,
  values: RecruiterProfileValues,
): RecruiterUpdate {
  const changes: RecruiterUpdate = {};
  const name = values.full_name.trim();
  if (name !== saved.full_name) changes.full_name = name;
  const title = values.title.trim() || null;
  if (title !== (saved.title ?? null)) changes.title = title;
  return changes;
}
