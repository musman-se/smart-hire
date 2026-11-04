import { useParams } from "react-router-dom";

import { ApiError } from "../api/client";
import { useUser } from "../auth/AuthProvider";
import { CandidateJobView } from "../components/job-detail/CandidateJobView";
import { RecruiterJobView } from "../components/job-detail/RecruiterJobView";
import {
  Button,
  ButtonLink,
  Card,
  EmptyState,
  ErrorNotice,
  Notice,
  PageHeader,
  Skeleton,
  SkeletonText,
} from "../components/ui";
import { useJob } from "../hooks/queries";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

/**
 * One page, two audiences. A recruiter runs the job: lifecycle, applicants, publishing
 * and what it extracted. A candidate reads the posting and applies. Each view fetches
 * only what its audience may read — the server would refuse the rest anyway.
 */
export function JobDetailPage() {
  const { jobId = "" } = useParams();
  const user = useUser();
  const { data: job, isLoading, error, refetch } = useJob(jobId);

  if (isLoading) return <JobDetailSkeleton />;
  // A failed background refetch (the 1s poll while publishing, a focus refetch) keeps
  // the last good job on screen, and with it a half-written cover letter. Only no job
  // at all, or a 404 saying it was deleted or unpublished, replaces the page.
  const gone = error instanceof ApiError && error.status === 404;
  if (!job || gone) return <JobUnavailable error={error} onRetry={() => void refetch()} />;

  return (
    <>
      {error && (
        <Notice
          tone="warning"
          title="Couldn't refresh this job"
          action={
            <Button size="sm" leftIcon="refresh" onClick={() => void refetch()}>
              Try again
            </Button>
          }
        >
          You're seeing what was last loaded.
        </Notice>
      )}
      {user.role === "recruiter" ? (
        <RecruiterJobView job={job} />
      ) : (
        <CandidateJobView job={job} candidateId={user.id} />
      )}
    </>
  );
}

function JobUnavailable({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  useDocumentTitle("Job not found");
  // A candidate gets 404 for any job that is not live, so "missing" covers both.
  const missing = !error || (error instanceof ApiError && error.status === 404);

  return (
    <>
      <PageHeader breadcrumbs={[{ label: "Jobs", to: "/jobs" }]} title={missing ? "Job not found" : "Job"} />
      {missing ? (
        <EmptyState
          icon="briefcase"
          title="This job is not available"
          description="It may have been closed, unpublished or deleted — or the link is mistyped."
          action={<ButtonLink to="/jobs" variant="primary">Browse jobs</ButtonLink>}
        />
      ) : (
        <>
          <ErrorNotice error={error} />
          <Button leftIcon="refresh" onClick={onRetry}>
            Try again
          </Button>
        </>
      )}
    </>
  );
}

function JobDetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the job">
      <div className="stack-sm job-detail-skeleton-head">
        <Skeleton width="8rem" height="0.75rem" />
        <Skeleton width="20rem" height="2rem" />
        <Skeleton width="28rem" height="0.875rem" />
      </div>
      <div className="grid-sidebar">
        <Card>
          <SkeletonText lines={8} />
        </Card>
        <Card>
          <SkeletonText lines={5} />
        </Card>
      </div>
    </div>
  );
}
