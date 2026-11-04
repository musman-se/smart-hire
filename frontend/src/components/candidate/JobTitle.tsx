import type { Job } from "../../api/types";
import { Skeleton } from "../ui";

/**
 * Applications carry a job id, not a title. A candidate can read published jobs and
 * closed ones they applied to; anything else (a deleted job) comes back missing, and
 * gets a plain explanation instead of a raw id.
 */
export const UNLISTED_JOB = "Role no longer listed";

export function jobTitleText(job: Job | undefined): string {
  return job?.title ?? "this role";
}

export function JobTitle({ job, loading }: { job: Job | undefined; loading: boolean }) {
  if (job) return <>{job.title}</>;
  if (loading) return <Skeleton width="12rem" height="1em" />;
  return <span className="candidate-unlisted">{UNLISTED_JOB}</span>;
}
