import type { Job } from "../../api/types";
import { useJobPublication, useJobTransition } from "../../hooks/queries";
import { useNow } from "../../hooks/useNow";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CopyButton,
  EmptyState,
  ErrorNotice,
  Icon,
  Notice,
  SkeletonText,
  Spinner,
  formatDateTime,
  formatRelative,
  humanize,
  useToast,
  type BadgeTone,
} from "../ui";
import { formatElapsed, publishProgress, type PublishOutcome, type StepState } from "./publishing";

const TEMPORAL_UI_URL = import.meta.env.VITE_TEMPORAL_UI_URL ?? "http://localhost:8233";

const temporalUrl = (workflowId: string) =>
  `${TEMPORAL_UI_URL}/namespaces/default/workflows/${encodeURIComponent(workflowId)}`;

const OUTCOME_BADGE: Record<PublishOutcome, { tone: BadgeTone; label: string }> = {
  idle: { tone: "neutral", label: "Not published" },
  running: { tone: "info", label: "Running" },
  completed: { tone: "success", label: "Completed" },
  failed: { tone: "danger", label: "Failed" },
  stuck: { tone: "warning", label: "Needs a restart" },
};

/**
 * Where publishing is. The job's status says what candidates see; the workflow's says
 * what Temporal is doing. They are shown side by side because they can differ — a job
 * can be closed while its run is still finishing, or stuck "processing" after its run
 * died, in which case publishing again is the recovery and is offered right here.
 */
export function PublishingTab({ job }: { job: Job }) {
  const { data: publication, isLoading, error } = useJobPublication(job.id, job.status);
  const transition = useJobTransition(job.id);
  const toast = useToast();
  const run = publication?.workflow;
  // The publication is re-read every second while the job is processing, so this
  // render-time clock moves on with it.
  const progress = publishProgress(job.status, run, {
    jobUpdatedAt: job.updated_at,
    now: Date.now(),
  });
  // Ticks once a second while the workflow runs, for its elapsed time.
  const now = useNow(progress.outcome === "running" ? 1000 : null);

  function publish() {
    transition.mutate("publish", { onError: (err) => toast.error(err) });
  }

  if (isLoading) {
    return (
      <Card>
        <SkeletonText lines={6} />
      </Card>
    );
  }
  if (error) return <ErrorNotice error={error} />;

  if (progress.outcome === "idle" && !run) {
    return (
      <Card>
        <EmptyState
          icon="send"
          title={job.status === "closed" ? "This job was closed before it was published" : "Not published yet"}
          description="Publishing analyses the description — skills, keywords and sections — so applicants can be scored, then puts the job live."
          action={
            job.status === "draft" && (
              <Button variant="primary" leftIcon="send" loading={transition.isPending} onClick={publish}>
                Publish now
              </Button>
            )
          }
        />
      </Card>
    );
  }

  const badge = OUTCOME_BADGE[progress.outcome];
  const elapsed = formatElapsed(run?.started_at, run?.closed_at ? Date.parse(run.closed_at) : now);

  return (
    <div className="grid-sidebar">
      <Card>
        <CardHeader
          title="Publishing run"
          icon="activity"
          description={
            progress.outcome === "running"
              ? "Live — this updates every second."
              : progress.outcome === "completed"
                ? `Finished${elapsed ? ` in ${elapsed}` : ""}.`
                : undefined
          }
          actions={
            <Badge tone={badge.tone} dot>
              {badge.label}
            </Badge>
          }
        />

        <ol className="job-detail-steps" aria-label="Publishing steps">
          {progress.steps.map((step) => (
            <li key={step.step} className="job-detail-step" data-state={step.state}>
              <span className="job-detail-step-marker" aria-hidden="true">
                <StepMarker state={step.state} />
              </span>
              <div>
                <p className="job-detail-step-label">
                  {step.label}
                  <span className="sr-only"> ({STEP_STATE_TEXT[step.state]})</span>
                </p>
                <p className="text-xs subtle">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>

        {progress.outcome === "failed" && (
          <Notice
            tone="error"
            title="Publishing failed — the job is not live"
            action={
              job.status === "publish_failed" && (
                <Button size="sm" variant="primary" leftIcon="refresh" loading={transition.isPending} onClick={publish}>
                  Retry publishing
                </Button>
              )
            }
          >
            <span className="mono">{job.publish_error ?? publication?.publish_error ?? "No reason was recorded."}</span>
            <br />
            Fix the job if the reason points at it, then publish again.
          </Notice>
        )}

        {progress.outcome === "stuck" && (
          <Notice
            tone="rule"
            title="No workflow is running for this job"
            action={
              <Button size="sm" variant="primary" leftIcon="refresh" loading={transition.isPending} onClick={publish}>
                Restart publishing
              </Button>
            }
          >
            It is still marked as publishing, but its last run {run ? `is ${humanize(run.status).toLowerCase()}` : "never started"} —
            usually because the workflow engine was down. Restarting starts a fresh run.
          </Notice>
        )}

        {progress.outcome === "completed" && job.status === "published" && (
          <Notice tone="success" title="Live">
            Candidates can find and apply to this job{job.published_at ? ` since ${formatDateTime(job.published_at)}` : ""}.
          </Notice>
        )}
      </Card>

      <Card>
        <CardHeader title="Run details" icon="info" />
        {run ? (
          <dl className="detail-list job-detail-run">
            <dt>Workflow</dt>
            <dd>
              <span className="row">
                <span className="mono truncate" title={run.workflow_id}>
                  {run.workflow_id}
                </span>
                <CopyButton value={run.workflow_id} label="workflow id" />
              </span>
            </dd>
            <dt>Status</dt>
            <dd>{humanize(run.status)}</dd>
            {run.current_step && (
              <>
                <dt>Step</dt>
                <dd>{humanize(run.current_step)}</dd>
              </>
            )}
            <dt>Started</dt>
            <dd title={formatDateTime(run.started_at)}>{run.started_at ? formatRelative(run.started_at) : "—"}</dd>
            <dt>{run.closed_at ? "Took" : "Running for"}</dt>
            <dd className="tabular">{elapsed ?? "—"}</dd>
            <dt>Analysed</dt>
            <dd>{formatDateTime(job.content_processed_at)}</dd>
          </dl>
        ) : (
          <p className="text-sm muted">No run has been recorded for this job.</p>
        )}
        {run && (
          <a
            className="job-detail-external text-sm"
            href={temporalUrl(run.workflow_id)}
            target="_blank"
            rel="noreferrer"
          >
            View in Temporal <Icon name="external-link" size={12} />
          </a>
        )}
      </Card>
    </div>
  );
}

const STEP_STATE_TEXT: Record<StepState, string> = {
  done: "done",
  current: "in progress",
  failed: "failed",
  upcoming: "not started",
};

function StepMarker({ state }: { state: StepState }) {
  if (state === "done") return <Icon name="check" size={14} strokeWidth={3} />;
  if (state === "failed") return <Icon name="x" size={14} strokeWidth={3} />;
  if (state === "current") return <Spinner size="sm" label="" />;
  return <Icon name="circle" size={10} />;
}
