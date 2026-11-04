import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import type { Application, Job } from "../../api/types";
import type { DashboardData } from "../../hooks/useDashboardData";
import {
  useCandidatesByIds,
  useJobTransition,
  useJobsByIds,
  useProcessApplication,
} from "../../hooks/queries";
import { jobName } from "../jobs/jobName";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  Icon,
  ProgressBar,
  SkeletonText,
  pluralize,
  useToast,
  type IconName,
} from "../ui";
import { formatDuration, type AttentionItem, type AttentionTone } from "./metrics";
import { CardError } from "./parts";

/** Enough to see the shape of the day; the rest is one click away. */
const VISIBLE_ITEMS = 5;

const TONE_BADGE = { danger: "danger", warning: "warning", info: "info" } as const;

function jobIdOf(item: AttentionItem): string | null {
  if (item.kind === "unscored") return item.application.job_id;
  if (item.kind === "stale_applied") return item.jobId;
  return null;
}

/**
 * The recruiter's to-do list: things that are broken, slipping or waiting, each with
 * the one action that fixes it. Names are resolved only for the rows on screen.
 */
export function AttentionCard({ data }: { data: DashboardData }) {
  const { items, isLoading, error } = data.attention;
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, VISIBLE_ITEMS);
  const hidden = items.length - shown.length;

  const jobs = useJobsByIds(shown.map(jobIdOf).filter((id): id is string => id !== null));
  const candidates = useCandidatesByIds(
    shown.flatMap((item) => (item.kind === "unscored" ? [item.application.candidate_id] : [])),
  );
  // Named in full: two jobs can share a title.
  const jobTitle = (id: string) => {
    const job = jobs.byId.get(id);
    return job ? jobName(job) : "a job";
  };

  const worst: AttentionTone | undefined = items[0]?.tone;

  if (!isLoading && !error && items.length === 0) {
    return (
      <Card className="dashboard-card dashboard-all-clear">
        <span className="dashboard-all-clear-icon" aria-hidden="true">
          <Icon name="check-circle" size={20} />
        </span>
        <div>
          <h2 className="card-title">Nothing needs your attention</h2>
          <p className="card-description">
            Every job published cleanly, every application is scored, and no one has been
            waiting in Applied for more than three days.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="dashboard-card" padding="none">
      <CardHeader
        icon="flag"
        title="Needs attention"
        description="Broken first, then slipping, then waiting"
        actions={
          worst && (
            <Badge tone={TONE_BADGE[worst]} dot>
              {pluralize(items.length, "item")}
            </Badge>
          )
        }
      />
      {error ? (
        <div className="dashboard-card-body">
          <CardError error={error} onRetry={data.refresh} />
        </div>
      ) : isLoading ? (
        <div className="dashboard-card-body" aria-busy="true">
          <span className="sr-only">Checking what needs attention…</span>
          <SkeletonText lines={3} />
        </div>
      ) : (
        <>
          <ul className="dashboard-attention" aria-label="Items needing attention">
            {shown.map((item) => {
              switch (item.kind) {
                case "publish_failed":
                  return <PublishFailedRow key={item.key} job={item.job} />;
                case "capacity":
                  return (
                    <CapacityRow
                      key={item.key}
                      tone={item.tone}
                      job={item.job}
                      received={item.received}
                      cap={item.cap}
                    />
                  );
                case "stuck_processing":
                  return (
                    <AttentionRow
                      key={item.key}
                      tone={item.tone}
                      icon="clock"
                      title={
                        <>
                          <JobLink job={item.job} /> has been publishing for {formatDuration(item.ageMs)}
                        </>
                      }
                      detail="Publishing normally takes seconds. The job page shows which step it is on."
                      action={
                        <ButtonLink size="sm" to={`/jobs/${item.job.id}?tab=publishing`}>
                          View progress
                        </ButtonLink>
                      }
                    />
                  );
                case "unscored":
                  return (
                    <UnscoredRow
                      key={item.key}
                      application={item.application}
                      ageMs={item.ageMs}
                      candidateName={candidates.byId.get(item.application.candidate_id)?.full_name}
                      jobTitle={jobTitle(item.application.job_id)}
                    />
                  );
                case "stale_applied":
                  return (
                    <AttentionRow
                      key={item.key}
                      tone={item.tone}
                      icon="inbox"
                      title={
                        <>
                          {pluralize(item.count, "application")} waiting in Applied for{" "}
                          <Link to={`/jobs/${item.jobId}`}>{jobTitle(item.jobId)}</Link>
                        </>
                      }
                      detail={`The oldest has waited ${formatDuration(item.oldestAgeMs)} for a first look.`}
                      action={
                        <ButtonLink
                          size="sm"
                          to={`/applications?job=${item.jobId}&stage=applied`}
                          rightIcon="arrow-right"
                        >
                          Review
                        </ButtonLink>
                      }
                    />
                  );
              }
            })}
          </ul>
          {(hidden > 0 || expanded) && (
            <div className="dashboard-card-foot">
              <Button
                variant="ghost"
                size="sm"
                rightIcon={expanded ? "chevron-up" : "chevron-down"}
                aria-expanded={expanded}
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded ? "Show fewer" : `Show ${pluralize(hidden, "more item")}`}
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

const TONE_ICON_LABEL: Record<AttentionTone, string> = {
  danger: "Broken",
  warning: "Slipping",
  info: "Waiting",
};

function AttentionRow({
  tone,
  icon,
  title,
  detail,
  action,
}: {
  tone: AttentionTone;
  icon: IconName;
  title: ReactNode;
  detail: ReactNode;
  action: ReactNode;
}) {
  return (
    <li className="dashboard-attention-item" data-tone={tone}>
      <span className="dashboard-attention-icon">
        <Icon name={icon} size={16} label={TONE_ICON_LABEL[tone]} />
      </span>
      <div className="dashboard-attention-body">
        <p className="dashboard-attention-title">{title}</p>
        <div className="dashboard-attention-detail">{detail}</div>
      </div>
      <div className="dashboard-attention-action">{action}</div>
    </li>
  );
}

function JobLink({ job }: { job: Job }) {
  return <Link to={`/jobs/${job.id}`}>{jobName(job)}</Link>;
}

function PublishFailedRow({ job }: { job: Job }) {
  const toast = useToast();
  const transition = useJobTransition(job.id);

  function retry() {
    transition.mutate("publish", {
      onSuccess: () =>
        toast.success(`Publishing “${job.title}” again`, {
          description: "It usually takes a few seconds.",
        }),
      onError: (error) => toast.error(error),
    });
  }

  return (
    <AttentionRow
      tone="danger"
      icon="alert-circle"
      title={
        <>
          <JobLink job={job} /> failed to publish
        </>
      }
      detail={
        <span className="dashboard-attention-error">
          {job.publish_error || "The publishing workflow stopped before it finished."}
        </span>
      }
      action={
        <Button size="sm" leftIcon="refresh" loading={transition.isPending} onClick={retry}>
          Retry publish
        </Button>
      }
    />
  );
}

function CapacityRow({
  tone,
  job,
  received,
  cap,
}: {
  tone: AttentionTone;
  job: Job;
  received: number;
  cap: number;
}) {
  const full = received >= cap;
  return (
    <AttentionRow
      tone={tone}
      icon="users"
      title={
        <>
          <JobLink job={job} /> is {full ? "full" : "nearly full"}
        </>
      }
      detail={
        <div className="dashboard-capacity">
          <ProgressBar
            size="sm"
            value={received}
            max={cap}
            tone={full ? "danger" : "warning"}
            label={`Applications received for ${job.title}`}
            valueText={`${received} of ${cap}`}
          />
          <span>
            {received} of {cap} · {full ? "new candidates cannot apply" : `${cap - received} places left`}
          </span>
        </div>
      }
      action={
        <ButtonLink size="sm" to={`/jobs/${job.id}/edit`}>
          Raise the cap
        </ButtonLink>
      }
    />
  );
}

function UnscoredRow({
  application,
  ageMs,
  candidateName,
  jobTitle,
}: {
  application: Application;
  ageMs: number;
  candidateName: string | undefined;
  jobTitle: string;
}) {
  const toast = useToast();
  const process = useProcessApplication();

  function rerun() {
    process.mutate(application.id, {
      onSuccess: () => toast.success("Scoring queued", { description: "The score appears here in a moment." }),
      onError: (error) => toast.error(error),
    });
  }

  return (
    <AttentionRow
      tone="warning"
      icon="target"
      title={
        <>
          <Link to={`/candidates/${application.candidate_id}`}>{candidateName ?? "A candidate"}</Link>
          {" → "}
          <Link to={`/jobs/${application.job_id}`}>{jobTitle}</Link> has no match score
        </>
      }
      detail={`Applied ${formatDuration(ageMs)} ago. Scoring normally lands within a second, so it likely never ran.`}
      action={
        <Button size="sm" leftIcon="sparkles" loading={process.isPending} onClick={rerun}>
          Re-run scoring
        </Button>
      }
    />
  );
}
