import type { Job } from "../../api/types";
import { Icon, humanize } from "../ui";

/** Department, location and employment type as a row of meta items. Missing facts
 * are left out rather than shown as dashes. */
export function JobMeta({ job }: { job: Pick<Job, "department" | "location" | "employment_type"> }) {
  return (
    <span className="candidate-job-meta">
      {job.department && (
        <span className="meta-item">
          <Icon name="building" size={14} />
          {job.department}
        </span>
      )}
      {job.location && (
        <span className="meta-item">
          <Icon name="map-pin" size={14} />
          {job.location}
        </span>
      )}
      <span className="meta-item">
        <Icon name="briefcase" size={14} />
        {humanize(job.employment_type)}
      </span>
    </span>
  );
}
