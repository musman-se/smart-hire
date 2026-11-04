import type { CSSProperties } from "react";
import { Link } from "react-router-dom";

import { APPLICATION_STAGES } from "../../api/types";
import type { DashboardData } from "../../hooks/useDashboardData";
import { useJobsByIds } from "../../hooks/queries";
import { jobName } from "../jobs/jobName";
import {
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  Skeleton,
  StatusPill,
  formatNumber,
  humanize,
  pluralize,
} from "../ui";
import { describeBreakdown, type JobVolume } from "./metrics";
import { CardError, StageSwatch, stageColor } from "./parts";

const TOP_JOBS = 5;

/** The jobs drawing the most applicants, each with where those applicants stand. */
export function TopJobsCard({ data }: { data: DashboardData }) {
  const { recent, volumes } = data;
  const top = volumes.slice(0, TOP_JOBS);
  const jobs = useJobsByIds(top.map((volume) => volume.jobId));

  return (
    <Card className="dashboard-card" padding="none">
      <CardHeader
        icon="briefcase"
        title="Top jobs by applicants"
        description={recent.truncated ? "Among the latest 100 applications" : "Across all applications"}
      />
      {recent.error ? (
        <div className="dashboard-card-body">
          <CardError error={recent.error} onRetry={data.refresh} />
        </div>
      ) : recent.isLoading ? (
        <div className="dashboard-card-body dashboard-skeleton-list" aria-busy="true">
          <span className="sr-only">Loading top jobs…</span>
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="stack-sm">
              <Skeleton width="50%" />
              <Skeleton height="0.5rem" />
            </div>
          ))}
        </div>
      ) : top.length === 0 ? (
        <EmptyState
          compact
          icon="briefcase"
          title="No applicants yet"
          description="Once a published job draws applications, the busiest ones rank here."
          action={
            <ButtonLink to="/jobs/new" size="sm" leftIcon="plus">
              Create a job
            </ButtonLink>
          }
        />
      ) : (
        <>
          <ol className="dashboard-top-jobs">
            {top.map((volume) => {
              const job = jobs.byId.get(volume.jobId);
              return (
                <li key={volume.jobId} className="dashboard-top-job">
                  <div className="dashboard-top-job-head">
                    <Link to={`/jobs/${volume.jobId}/pipeline`} className="dashboard-top-job-title">
                      {job ? jobName(job) : "Loading job…"}
                    </Link>
                    {job && <StatusPill status={job.status} />}
                    <span className="dashboard-top-job-count">
                      {pluralize(volume.total, "applicant")}
                      <span className="subtle"> · {formatNumber(volume.active)} active</span>
                    </span>
                  </div>
                  <StageBar volume={volume} />
                </li>
              );
            })}
          </ol>
          <ul className="dashboard-legend-list" aria-label="Stage colours">
            {APPLICATION_STAGES.map((stage) => (
              <li key={stage}>
                <StageSwatch stage={stage} />
                {humanize(stage)}
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function StageBar({ volume }: { volume: JobVolume }) {
  const label = describeBreakdown(volume.byStage);
  return (
    <span className="dashboard-stagebar" role="img" aria-label={label} title={label}>
      {APPLICATION_STAGES.filter((stage) => volume.byStage[stage] > 0).map((stage) => (
        <span
          key={stage}
          className="dashboard-stagebar-segment"
          style={
            {
              "--bar-size": volume.byStage[stage] / volume.total,
              "--bar-color": stageColor(stage),
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}
