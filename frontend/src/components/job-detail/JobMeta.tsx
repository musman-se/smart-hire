import type { Job } from "../../api/types";
import { Icon, formatDateTime, formatRelative, formatYears, humanize } from "../ui";

/**
 * The facts row under a job's title. A recruiter sees when it was created and went
 * live; a candidate only how fresh the posting is.
 */
export function JobMeta({ job, audience }: { job: Job; audience: "recruiter" | "candidate" }) {
  return (
    <>
      {job.department && (
        <span className="meta-item">
          <Icon name="building" />
          {job.department}
        </span>
      )}
      <span className="meta-item">
        <Icon name="map-pin" />
        {job.location || (audience === "recruiter" ? "No location set" : "Location not specified")}
      </span>
      <span className="meta-item">
        <Icon name="briefcase" />
        {humanize(job.employment_type)}
      </span>
      {job.min_experience_years > 0 && (
        <span className="meta-item">
          <Icon name="award" />
          {formatYears(job.min_experience_years)}+ experience
        </span>
      )}
      {audience === "recruiter" ? (
        <RecruiterMilestone job={job} />
      ) : (
        job.published_at && (
          <span className="meta-item" title={formatDateTime(job.published_at)}>
            <Icon name="clock" />
            Posted {formatRelative(job.published_at)}
          </span>
        )
      )}
    </>
  );
}

/**
 * The latest step in the job's life. The API keeps no closed_at, but a closed job
 * refuses edits, so its last update is the close.
 */
function RecruiterMilestone({ job }: { job: Job }) {
  const [label, at] =
    job.status === "closed"
      ? ["Closed", job.updated_at]
      : job.published_at
        ? ["Published", job.published_at]
        : ["Created", job.created_at];
  return (
    <span className="meta-item" title={formatDateTime(at)}>
      <Icon name="calendar" />
      {label} {formatRelative(at)}
    </span>
  );
}
