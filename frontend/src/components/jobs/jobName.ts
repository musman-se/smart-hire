import type { Job } from "../../api/types";

/** "Engineering · Lahore": where a job sits. Empty when it has neither. */
export function jobContext(job: Pick<Job, "department" | "location">): string {
  return [job.department, job.location].filter(Boolean).join(" · ");
}

/**
 * "Frontend Engineer · Engineering · Lahore": the title with where the job sits, for
 * places that name a job without its card around it (a select option, a sentence), so
 * two jobs with the same title can be told apart.
 */
export function jobName(job: Pick<Job, "title" | "department" | "location">): string {
  return [job.title, jobContext(job)].filter(Boolean).join(" · ");
}
