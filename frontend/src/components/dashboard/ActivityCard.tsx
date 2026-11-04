import { useMemo } from "react";
import { Link } from "react-router-dom";

import type { DashboardData } from "../../hooks/useDashboardData";
import { useCandidatesByIds, useJobsByIds } from "../../hooks/queries";
import {
  Avatar,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  ScoreRing,
  Skeleton,
  StagePill,
  formatDateTime,
  formatRelative,
} from "../ui";
import { CardError } from "./parts";

/** One screen's worth: a feed, not a list to work through (that is /applications). */
const FEED_LENGTH = 8;

/** The newest applications, with the people and jobs they connect named. */
export function ActivityCard({ data }: { data: DashboardData }) {
  const { recent, now } = data;
  const feed = useMemo(() => recent.applications.slice(0, FEED_LENGTH), [recent.applications]);
  const candidates = useCandidatesByIds(feed.map((application) => application.candidate_id));
  const jobs = useJobsByIds(feed.map((application) => application.job_id));

  return (
    <Card className="dashboard-card" padding="none">
      <CardHeader
        icon="activity"
        title="Recent applications"
        description="Newest first"
        actions={
          feed.length > 0 && (
            <ButtonLink to="/applications?stage=all" variant="ghost" size="sm" rightIcon="arrow-right">
              View all
            </ButtonLink>
          )
        }
      />
      {recent.error ? (
        <div className="dashboard-card-body">
          <CardError error={recent.error} onRetry={data.refresh} />
        </div>
      ) : recent.isLoading ? (
        <ActivitySkeleton />
      ) : feed.length === 0 ? (
        <EmptyState
          compact
          icon="inbox"
          title="No applications yet"
          description="When candidates apply to a published job, they appear here first."
          action={
            <ButtonLink to="/jobs" size="sm">
              See your jobs
            </ButtonLink>
          }
        />
      ) : (
        <ul className="dashboard-feed">
          {feed.map((application) => {
            const candidate = candidates.byId.get(application.candidate_id);
            const job = jobs.byId.get(application.job_id);
            const name = candidate?.full_name ?? candidate?.email;
            return (
              <li key={application.id} className="dashboard-feed-item">
                {name ? <Avatar name={name} size="sm" /> : <Skeleton circle width="1.75rem" />}
                <div className="dashboard-feed-body">
                  <p className="dashboard-feed-title">
                    <Link to={`/candidates/${application.candidate_id}`}>
                      {name ?? "Loading candidate…"}
                    </Link>{" "}
                    <span className="muted">applied to</span>{" "}
                    <Link to={`/jobs/${application.job_id}`}>{job?.title ?? "a job"}</Link>
                  </p>
                  <p className="dashboard-feed-meta">
                    <time dateTime={application.created_at} title={formatDateTime(application.created_at)}>
                      {formatRelative(application.created_at, now)}
                    </time>
                    {application.stage !== "applied" && <StagePill stage={application.stage} />}
                  </p>
                </div>
                <ScoreRing score={application.match_score} size={32} strokeWidth={3} />
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function ActivitySkeleton() {
  return (
    <ul className="dashboard-feed" aria-busy="true">
      <li className="sr-only">Loading recent applications…</li>
      {Array.from({ length: 5 }, (_, index) => (
        <li key={index} className="dashboard-feed-item" aria-hidden="true">
          <Skeleton circle width="1.75rem" />
          <div className="dashboard-feed-body">
            <Skeleton width={`${60 + ((index * 13) % 30)}%`} />
            <Skeleton width="4rem" height="0.625rem" />
          </div>
          <Skeleton circle width="2rem" />
        </li>
      ))}
    </ul>
  );
}
