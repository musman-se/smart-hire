/**
 * Why an application scored what it did, rebuilt from the same three factors the
 * backend weighs (backend/app/applications/scoring.py). The stored score is the
 * authority; this only explains it — and spots when the profile has changed since.
 */

import type { Candidate, Job } from "../../api/types";
import { formatYears, pluralize } from "../../lib/format";
import { skillMatch } from "../../lib/match";

export const SCORE_WEIGHTS = { required: 0.6, experience: 0.25, other: 0.15 } as const;

export type ScoreFactorKey = keyof typeof SCORE_WEIGHTS;

export interface ScoreFactor {
  key: ScoreFactorKey;
  label: string;
  weight: number;
  /** 0–1, or null when it cannot be known yet (the description is not analysed). */
  share: number | null;
  detail: string;
}

export interface ScoreExplanation {
  factors: ScoreFactor[];
  /** 0–100 to one decimal, as the server rounds; null while a factor is unknown. */
  estimate: number | null;
}

const normalise = (skill: string) => skill.trim().toLowerCase();

/**
 * `mentionedSkills` are the skills the publishing workflow found in the description;
 * pass undefined while they are loading. A factor with nothing to measure counts in
 * full, as it does on the server: no evidence against the candidate.
 */
export function explainScore(
  candidate: Pick<Candidate, "skills" | "years_experience">,
  job: Pick<Job, "required_skills" | "min_experience_years">,
  mentionedSkills: readonly string[] | undefined,
): ScoreExplanation {
  const required = skillMatch(candidate.skills, job.required_skills);
  const requiredTotal = required.matched.length + required.missing.length;

  const years = candidate.years_experience ?? 0;
  const minYears = job.min_experience_years ?? 0;

  const factors: ScoreFactor[] = [
    {
      key: "required",
      label: "Required skills",
      weight: SCORE_WEIGHTS.required,
      share: required.ratio,
      detail:
        requiredTotal === 0
          ? "The job lists none, so this counts in full."
          : `Has ${required.matched.length} of ${pluralize(requiredTotal, "required skill")}.`,
    },
    {
      key: "experience",
      label: "Experience",
      weight: SCORE_WEIGHTS.experience,
      share: minYears > 0 ? Math.min(1, years / minYears) : 1,
      detail:
        minYears > 0
          ? `${formatYears(years)} against a ${formatYears(minYears)} minimum.`
          : "No minimum set, so this counts in full.",
    },
    otherSkillsFactor(candidate.skills, job.required_skills, mentionedSkills),
  ];

  const known = factors.every((factor) => factor.share !== null);
  const estimate = known
    ? Math.round(1000 * factors.reduce((sum, f) => sum + f.weight * (f.share ?? 0), 0)) / 10
    : null;

  return { factors, estimate };
}

function otherSkillsFactor(
  candidateSkills: readonly string[] | null | undefined,
  requiredSkills: readonly string[] | null | undefined,
  mentionedSkills: readonly string[] | undefined,
): ScoreFactor {
  const base = { key: "other", label: "Other skills in the description", weight: SCORE_WEIGHTS.other } as const;
  if (mentionedSkills === undefined) {
    return { ...base, share: null, detail: "Known once the description has been analysed." };
  }

  const required = new Set((requiredSkills ?? []).map(normalise));
  const other = [...new Set(mentionedSkills.map(normalise))].filter((skill) => !required.has(skill));
  if (other.length === 0) {
    return { ...base, share: 1, detail: "The description mentions none beyond the required ones." };
  }

  const have = new Set((candidateSkills ?? []).map(normalise));
  const matched = other.filter((skill) => have.has(skill)).length;
  return {
    ...base,
    share: matched / other.length,
    detail: `Has ${matched} of ${pluralize(other.length, "other skill")} it mentions.`,
  };
}

/** A stored score this far from today's estimate was computed from an older profile. */
const DRIFT_TOLERANCE = 1;

export function scoreIsStale(stored: number | null | undefined, estimate: number | null): boolean {
  if (stored === null || stored === undefined || estimate === null) return false;
  return Math.abs(stored - estimate) > DRIFT_TOLERANCE;
}

/** The words next to a score ring. */
export function scoreVerdict(score: number | null | undefined): string {
  if (score === null || score === undefined) return "Not scored yet";
  if (score >= 75) return "Strong match";
  if (score >= 50) return "Fair match";
  return "Weak match";
}
