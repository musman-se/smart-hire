import type { CandidateRegistration } from "../../api/types";
import { looksLikePhone } from "../../lib/phone";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./password";
import { codePointLength, looksLikeEmail, type FieldErrors } from "./validation";

/** Mirrors CandidateBase in backend/app/candidates/schemas.py and
 * SKILL_NAME_MAX_LENGTH in backend/app/skills/schemas.py. */
export const LIMITS = {
  fullNameMin: 2,
  fullNameMax: 160,
  headlineMax: 200,
  phoneMax: 32,
  yearsMax: 60,
  skillMax: 64,
} as const;

export const REGISTRATION_STEPS = ["account", "profile"] as const;
export type RegistrationStep = (typeof REGISTRATION_STEPS)[number];

export const STEP_COPY: Record<RegistrationStep, { title: string; description: string }> = {
  account: { title: "Account", description: "How you sign in" },
  profile: { title: "Profile", description: "What hiring teams see" },
};

/**
 * Ideas offered as the user types a skill. A fixed list, because /skills needs a
 * signed-in user and this form has none yet; free entry is always allowed.
 */
export const SKILL_IDEAS: readonly string[] = [
  "python",
  "javascript",
  "typescript",
  "react",
  "node.js",
  "java",
  "go",
  "sql",
  "postgresql",
  "fastapi",
  "django",
  "aws",
  "docker",
  "kubernetes",
  "machine learning",
  "data analysis",
  "figma",
  "product management",
  "project management",
  "customer support",
];

/** The form as typed. Years stay a string so an emptied box is not silently 0. */
export interface RegistrationDraft {
  full_name: string;
  email: string;
  password: string;
  headline: string;
  years_experience: string;
  skills: string[];
  phone: string;
}

export type RegistrationField = keyof RegistrationDraft;

/** Which fields each step owns, in on-screen order: also the order focus visits errors. */
export const STEP_FIELDS: Record<RegistrationStep, readonly RegistrationField[]> = {
  account: ["full_name", "email", "password"],
  profile: ["headline", "years_experience", "skills", "phone"],
};

export const EMPTY_DRAFT: RegistrationDraft = {
  full_name: "",
  email: "",
  password: "",
  headline: "",
  years_experience: "0",
  skills: [],
  phone: "",
};

type Rule = (draft: RegistrationDraft) => string | undefined;

const RULES: Record<RegistrationField, Rule> = {
  full_name: ({ full_name }) => {
    const length = codePointLength(full_name.trim());
    if (length === 0) return "Enter your full name";
    if (length < LIMITS.fullNameMin) return `Use at least ${LIMITS.fullNameMin} characters`;
    if (length > LIMITS.fullNameMax) return `Use ${LIMITS.fullNameMax} characters or fewer`;
  },
  email: ({ email }) => {
    if (!email.trim()) return "Enter your email address";
    if (!looksLikeEmail(email)) return "Enter an email address like name@example.com";
  },
  password: ({ password }) => {
    const length = codePointLength(password);
    if (length === 0) return "Create a password";
    if (length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters`;
    if (length > PASSWORD_MAX_LENGTH) return `Use ${PASSWORD_MAX_LENGTH} characters or fewer`;
  },
  headline: ({ headline }) => {
    if (codePointLength(headline.trim()) > LIMITS.headlineMax) {
      return `Keep it to ${LIMITS.headlineMax} characters`;
    }
  },
  years_experience: ({ years_experience }) => {
    const raw = years_experience.trim();
    if (!raw) return "Enter your years of experience — 0 is fine if you are starting out";
    const years = Number(raw);
    if (!Number.isInteger(years)) return "Use a whole number of years";
    if (years < 0 || years > LIMITS.yearsMax) return `Enter a number from 0 to ${LIMITS.yearsMax}`;
  },
  skills: ({ skills }) => {
    const tooLong = skills.find((skill) => codePointLength(skill) > LIMITS.skillMax);
    if (tooLong) return `Skill names are at most ${LIMITS.skillMax} characters: "${tooLong.slice(0, 20)}…"`;
  },
  phone: ({ phone }) => {
    if (codePointLength(phone.trim()) > LIMITS.phoneMax) {
      return `Use ${LIMITS.phoneMax} characters or fewer`;
    }
    if (!looksLikePhone(phone)) return "Enter a phone number (digits, spaces, +, -), like +92 300 1234567";
  },
};

/** Errors for one step's fields only, so step 1 can be finished without step 2. */
export function validateStep(
  step: RegistrationStep,
  draft: RegistrationDraft,
): FieldErrors<RegistrationField> {
  const errors: FieldErrors<RegistrationField> = {};
  for (const field of STEP_FIELDS[step]) {
    const message = RULES[field](draft);
    if (message) errors[field] = message;
  }
  return errors;
}

/**
 * The request body. Text is trimmed and optional blanks become null, so "  " is not
 * stored as someone's headline. Skills are lowercased the way the API stores them
 * (normalise_skill_names), which keeps what the user sees here identical to what
 * their profile will show.
 */
export function toRegistrationPayload(draft: RegistrationDraft): CandidateRegistration {
  return {
    full_name: draft.full_name.trim(),
    email: draft.email.trim(),
    password: draft.password,
    headline: draft.headline.trim() || null,
    phone: draft.phone.trim() || null,
    years_experience: Number(draft.years_experience),
    skills: draft.skills,
  };
}

/** TagInput's normaliser for skills: what the API would store. */
export function normalizeSkill(skill: string): string {
  return skill.trim().toLowerCase();
}
