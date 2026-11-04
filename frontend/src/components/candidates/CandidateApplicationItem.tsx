import { useId, useState } from "react";
import { Link } from "react-router-dom";

import type { Application, Job } from "../../api/types";
import { ApplicationActions } from "../applications/ApplicationActions";
import { ApplicationActivity } from "../applications/ApplicationActivity";
import { isScoreStalled } from "../applications/stages";
import { useRescore } from "../applications/useRescore";
import {
  Badge,
  Button,
  Icon,
  ScoreRing,
  Skeleton,
  StagePill,
  StatusPill,
  formatDateTime,
  formatRelative,
  skillMatch,
} from "../ui";

export interface CandidateApplicationItemProps {
  application: Application;
  /** Undefined while loading, or when the job is gone. */
  job: Job | undefined;
  jobLoading: boolean;
  candidateName: string;
  candidateSkills: readonly string[];
  now: number;
}

/**
 * One of a candidate's applications on their profile: the job, where it stands, how
 * well they match, and the recruiter's moves — with the cover letter and the full
 * history one click away rather than always on screen.
 */
export function CandidateApplicationItem({
  application,
  job,
  jobLoading,
  candidateName,
  candidateSkills,
  now,
}: CandidateApplicationItemProps) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const { rescore, isPending: rescoring } = useRescore();
  const stalled = isScoreStalled(application, now);
  const jobTitle = job?.title ?? "Unavailable job";
  const required = job?.required_skills ?? [];
  const match = required.length > 0 ? skillMatch(candidateSkills, required) : null;

  return (
    <li className="candidates-app" data-expanded={expanded || undefined}>
      <div className="candidates-app-row">
        <ScoreRing score={application.match_score} size={44} />

        <div className="candidates-app-text">
          <div className="candidates-app-title">
            {jobLoading && !job ? (
              <Skeleton width="12rem" />
            ) : (
              <Link to={`/jobs/${application.job_id}`} className="candidates-app-job">
                {jobTitle}
              </Link>
            )}
            {job && job.status !== "published" && <StatusPill status={job.status} />}
          </div>
          <div className="candidates-app-meta">
            <StagePill stage={application.stage} />
            {job?.department && <span className="meta-item">{job.department}</span>}
            {match && (
              <span
                className="meta-item"
                title={match.missing.length > 0 ? `Missing: ${match.missing.join(", ")}` : undefined}
              >
                <Icon name="target" size={14} />
                {match.matched.length}/{required.length} skills
              </span>
            )}
            <span className="meta-item">
              <Icon name="clock" size={14} />
              <time dateTime={application.created_at} title={formatDateTime(application.created_at)}>
                Applied {formatRelative(application.created_at, now)}
              </time>
            </span>
          </div>
        </div>

        <ApplicationActions
          application={application}
          candidateName={candidateName}
          jobTitle={jobTitle}
          hideCandidateLink
        />
      </div>

      {stalled && (
        <div className="candidates-app-stalled">
          <Badge tone="warning" icon="alert-triangle">
            Not scored yet
          </Badge>
          <span className="text-sm muted">Scoring normally takes a second; this one never ran.</span>
          <Button size="sm" variant="link" loading={rescoring} onClick={() => rescore(application.id)}>
            Re-run scoring
          </Button>
        </div>
      )}

      <button
        type="button"
        className="candidates-app-toggle"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((open) => !open)}
      >
        <Icon name={expanded ? "chevron-up" : "chevron-down"} size={14} />
        {expanded ? "Hide details" : "Cover letter and activity"}
      </button>

      <div id={panelId} className="candidates-app-panel" hidden={!expanded}>
        {/* Mounted only when opened: each panel reads its own history. */}
        {expanded && (
          <>
            <section aria-label="Cover letter">
              <h4 className="mini-head">Cover letter</h4>
              {application.cover_letter?.trim() ? (
                <p className="prewrap candidates-app-letter">{application.cover_letter}</p>
              ) : (
                <p className="subtle text-sm">No cover letter was included.</p>
              )}
            </section>
            <section aria-label="Activity">
              <h4 className="mini-head">Activity</h4>
              <ApplicationActivity applicationId={application.id} stage={application.stage} />
            </section>
          </>
        )}
      </div>
    </li>
  );
}
