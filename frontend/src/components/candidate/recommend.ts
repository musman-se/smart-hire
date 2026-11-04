/**
 * "Recommended for you": published jobs the candidate could apply to today, best fit
 * first. Built on the same eligibility preview the apply button uses, so a job is
 * never recommended that the server would turn down on skills or experience.
 */

import type { Candidate, Job } from "../../api/types";
import { eligibility, type SkillMatch } from "../../lib/match";

type ProfileFacts = Pick<Candidate, "skills" | "years_experience">;

export interface Recommendation {
  job: Job;
  match: SkillMatch;
  /** Why it was picked, in the candidate's terms: "Matches 4 of 5 skills". */
  reasons: string[];
}

/**
 * A job that names no skills matches everyone, so its ratio of 1 would put it above a
 * job matching four of five. It ranks as a middling fit instead.
 */
const OPEN_JOB_RELEVANCE = 0.5;

const requiredCount = (match: SkillMatch) => match.matched.length + match.missing.length;

function relevance(match: SkillMatch): number {
  return requiredCount(match) === 0 ? OPEN_JOB_RELEVANCE : match.ratio;
}

function skillReason(match: SkillMatch): string {
  const required = requiredCount(match);
  if (required === 0) return "Open to any skill set";
  if (match.missing.length === 0) {
    return required === 1 ? "Matches the required skill" : `Matches all ${required} required skills`;
  }
  return `Matches ${match.matched.length} of ${required} skills`;
}

function experienceReason(job: Job): string {
  const years = job.min_experience_years ?? 0;
  return years > 0 ? `You meet the ${years}+ years asked` : "Open to all experience levels";
}

const publishedTime = (job: Job) => Date.parse(job.published_at ?? job.created_at);

export function recommendJobs(
  profile: ProfileFacts,
  jobs: readonly Job[],
  appliedJobIds: ReadonlySet<string>,
  limit = 6,
): Recommendation[] {
  return jobs
    .filter((job) => job.status === "published" && !appliedJobIds.has(job.id))
    .map((job) => ({ job, verdict: eligibility(profile, job) }))
    .filter(({ verdict }) => verdict.eligible)
    .map(({ job, verdict }) => ({
      job,
      match: verdict.match,
      reasons: [skillReason(verdict.match), experienceReason(job)],
    }))
    .sort(
      (a, b) =>
        relevance(b.match) - relevance(a.match) ||
        b.match.matched.length - a.match.matched.length ||
        publishedTime(b.job) - publishedTime(a.job),
    )
    .slice(0, limit);
}
