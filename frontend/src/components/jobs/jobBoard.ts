/**
 * The candidate job board's client-side logic. The server filters by title and skill;
 * everything here (type, location, fit, applied, sort) runs over the loaded openings.
 */

import {
  TERMINAL_STAGES,
  type Application,
  type Candidate,
  type EmploymentType,
  type Job,
} from "../../api/types";
import { eligibility, type Eligibility } from "../../lib/match";

export type BoardSort = "newest" | "match";
export const BOARD_SORTS = ["newest", "match"] as const satisfies readonly BoardSort[];

export interface BoardFilters {
  type: EmploymentType | "";
  location: string;
  eligibleOnly: boolean;
  hideApplied: boolean;
  sort: BoardSort;
}

export interface BoardEntry {
  job: Job;
  /** Null until the candidate's profile has loaded. */
  fit: Eligibility | null;
  /** The candidate's application to this job, if any — at most one per job. */
  application: Application | null;
}

/** When the job went live: what "posted" means to a candidate. */
export function postedAt(job: Pick<Job, "published_at" | "created_at">): string {
  return job.published_at ?? job.created_at;
}

/** The server allows one application per job (withdrawn ones included), so this is a
 * lookup; the newest wins should that ever change. */
export function applicationsByJob(applications: readonly Application[]): Map<string, Application> {
  const byJob = new Map<string, Application>();
  for (const application of applications) {
    const existing = byJob.get(application.job_id);
    if (!existing || existing.created_at < application.created_at) {
      byJob.set(application.job_id, application);
    }
  }
  return byJob;
}

export function countActive(applications: readonly Application[]): number {
  return applications.filter((application) => !TERMINAL_STAGES.has(application.stage)).length;
}

type Profile = Pick<Candidate, "years_experience" | "skills">;

export function buildBoard(
  jobs: readonly Job[],
  profile: Profile | null | undefined,
  applications: ReadonlyMap<string, Application>,
  filters: BoardFilters,
): BoardEntry[] {
  const location = filters.location.trim().toLowerCase();

  const entries = jobs
    .map((job) => ({
      job,
      fit: profile ? eligibility(profile, job) : null,
      application: applications.get(job.id) ?? null,
    }))
    .filter(({ job, fit, application }) => {
      if (filters.type && job.employment_type !== filters.type) return false;
      if (location && !(job.location ?? "").toLowerCase().includes(location)) return false;
      // Without a profile there is nothing to judge fit by, so nothing is hidden.
      if (filters.eligibleOnly && fit && !fit.eligible) return false;
      if (filters.hideApplied && application) return false;
      return true;
    });

  return sortBoard(entries, filters.sort);
}

const newestFirst = (a: BoardEntry, b: BoardEntry) =>
  postedAt(b.job).localeCompare(postedAt(a.job));

/** "Best match": roles they can apply to first, then by share of skills they have,
 * then newest. Without a profile it is simply newest. */
export function sortBoard(entries: readonly BoardEntry[], sort: BoardSort): BoardEntry[] {
  const sorted = [...entries];
  if (sort === "newest") return sorted.sort(newestFirst);
  return sorted.sort(
    (a, b) =>
      Number(b.fit?.eligible ?? false) - Number(a.fit?.eligible ?? false) ||
      (b.fit?.match.ratio ?? 0) - (a.fit?.match.ratio ?? 0) ||
      newestFirst(a, b),
  );
}

export function hasBoardFilters(filters: BoardFilters & { search: string; skill: string }): boolean {
  return Boolean(
    filters.search ||
      filters.skill ||
      filters.type ||
      filters.location ||
      filters.eligibleOnly ||
      filters.hideApplied,
  );
}
