/**
 * Client-side previews of the server's eligibility rule (backend/app/applications/
 * service.py, _check_eligibility). They let the UI rank, highlight and warn before a
 * request is made — they never replace the server's answer. If the two disagree, the
 * server is right and this file has a bug.
 */

import type { Candidate, Job } from "../api/types";

export interface SkillMatch {
  /** Job skills the candidate has, in the job's own spelling. */
  matched: string[];
  /** Job skills the candidate lacks. */
  missing: string[];
  /** matched / job skills, 0–1. A job that asks for no skills is a full match. */
  ratio: number;
}

const normalise = (skill: string) => skill.trim().toLowerCase();

/** Case-insensitive overlap between a candidate's skills and a job's required skills. */
export function skillMatch(
  candidateSkills: readonly string[] | null | undefined,
  jobSkills: readonly string[] | null | undefined,
): SkillMatch {
  const have = new Set((candidateSkills ?? []).map(normalise));
  const required = [...new Map((jobSkills ?? []).map((s) => [normalise(s), s])).values()];

  const matched = required.filter((skill) => have.has(normalise(skill)));
  const missing = required.filter((skill) => !have.has(normalise(skill)));
  const ratio = required.length === 0 ? 1 : matched.length / required.length;

  return { matched, missing, ratio };
}

export interface Eligibility {
  eligible: boolean;
  /** Why not, one neutral sentence per failed rule (reads right to a candidate and to
   * a recruiter); empty when eligible. */
  reasons: string[];
  match: SkillMatch;
}

type CandidateFacts = Pick<Candidate, "years_experience" | "skills">;
type JobFacts = Pick<Job, "min_experience_years" | "required_skills">;

/**
 * The server's two rules: enough years of experience, and — when the job lists
 * skills — at least one of them. Unlike the server, which stops at the first failure,
 * this reports every reason, so a candidate sees everything they would need to change.
 */
export function eligibility(candidate: CandidateFacts, job: JobFacts): Eligibility {
  const reasons: string[] = [];
  const match = skillMatch(candidate.skills, job.required_skills);

  const years = candidate.years_experience ?? 0;
  const required = job.min_experience_years ?? 0;
  if (years < required) {
    reasons.push(`Needs ${required}+ years of experience (has ${years}).`);
  }
  if (match.missing.length > 0 && match.matched.length === 0) {
    reasons.push(`Has none of the required skills: ${match.missing.join(", ")}.`);
  }

  return { eligible: reasons.length === 0, reasons, match };
}
