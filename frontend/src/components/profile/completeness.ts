/**
 * How complete a candidate's profile is, as a checklist. Each item is something a
 * recruiter looks for when screening; the home page shows it as a meter and the
 * profile page links each item to its field.
 */

import type { Candidate } from "../../api/types";

/** Below this, a skills list is too thin to match jobs on. */
export const MIN_SKILLS = 3;

export type ChecklistKey = "headline" | "years_experience" | "skills" | "phone" | "resume_url";

export interface ChecklistItem {
  key: ChecklistKey;
  label: string;
  /** Why it is worth doing — shown while it is not done. */
  hint: string;
  done: boolean;
}

export interface Completeness {
  items: ChecklistItem[];
  done: number;
  total: number;
  /** 0–1. */
  ratio: number;
}

type ProfileFacts = Pick<Candidate, "headline" | "phone" | "skills" | "resume_url" | "years_experience">;

const filled = (value: string | null | undefined) => Boolean(value?.trim());

export function profileCompleteness(profile: ProfileFacts): Completeness {
  const skills = profile.skills?.length ?? 0;
  const items: ChecklistItem[] = [
    {
      key: "headline",
      label: "Add a headline",
      hint: "One line recruiters read before anything else.",
      done: filled(profile.headline),
    },
    {
      key: "years_experience",
      label: "Add your experience",
      hint: "Many roles ask for a minimum number of years.",
      // The API defaults to 0, so 0 cannot be told apart from "never set".
      done: profile.years_experience > 0,
    },
    {
      key: "skills",
      label: `List at least ${MIN_SKILLS} skills`,
      hint:
        skills === 0
          ? "Skills decide which jobs you are eligible for."
          : `${skills} so far — more skills, better matches.`,
      done: skills >= MIN_SKILLS,
    },
    {
      key: "phone",
      label: "Add a phone number",
      hint: "So a recruiter can reach you quickly.",
      done: filled(profile.phone),
    },
    {
      key: "resume_url",
      label: "Link your resume",
      hint: "Recruiters open it from your application.",
      done: filled(profile.resume_url),
    },
  ];
  const done = items.filter((item) => item.done).length;
  return { items, done, total: items.length, ratio: done / items.length };
}

/** The id of a profile form field, so a checklist item can link straight to it. */
export const profileFieldId = (key: string) => `profile-${key}`;

/** "/profile#headline" — the profile page focuses that field on arrival. */
export const profileFieldHref = (key: ChecklistKey) => `/profile#${key}`;
