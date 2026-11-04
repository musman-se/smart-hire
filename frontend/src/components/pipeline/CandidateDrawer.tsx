import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import {
  TERMINAL_STAGES,
  type Application,
  type ApplicationStage,
  type Candidate,
  type Job,
} from "../../api/types";
import {
  useApplication,
  useApplicationHistory,
  useApplicationNotifications,
  useCandidate,
  useJobContent,
  useProcessApplication,
} from "../../hooks/queries";
import {
  Avatar,
  Button,
  ButtonLink,
  CopyButton,
  Drawer,
  EmptyState,
  ErrorNotice,
  Icon,
  IconButton,
  ScoreRing,
  Skeleton,
  SkeletonText,
  StagePill,
  StageStepper,
  Timeline,
  formatDateTime,
  formatRelative,
  formatYears,
  humanize,
  skillMatch,
  stoppedAt,
  useToast,
  type TimelineItem,
} from "../ui";
import { recruiterTargets } from "../applications/stages";
import { applicantName, moveLabel } from "./model";
import { explainScore, scoreIsStale, scoreVerdict } from "./scoreExplain";

export interface CandidateDrawerProps {
  job: Job;
  /** The open application's id; empty closes the drawer. */
  applicationId: string;
  /** The application as the job's list has it — live with optimistic moves. When the
   * id is not in the list (it is older than the latest 100), it is fetched on its own. */
  application: Application | undefined;
  onClose: () => void;
  onRequestMove: (application: Application, stage: ApplicationStage) => void;
  /** Step through the list behind the drawer; undefined at either end. */
  onPrevious?: () => void;
  onNext?: () => void;
}

/**
 * One application, in full, without leaving the list or board it was opened from:
 * who applied and for which job, how they match it and why, where they are in the
 * process and what has happened so far. Recruiters only.
 */
export function CandidateDrawer({
  job,
  applicationId,
  application: listed,
  onClose,
  onRequestMove,
  onPrevious,
  onNext,
}: CandidateDrawerProps) {
  // An empty id disables the query: only fetch what the list could not provide.
  const fetched = useApplication(listed ? "" : applicationId);
  const application = listed ?? fetched.data;
  const { data: candidate } = useCandidate(application?.candidate_id ?? "");

  const name = application ? applicantName(candidate) : "Applicant";

  return (
    <Drawer
      open={Boolean(applicationId)}
      onClose={onClose}
      size="lg"
      title={candidate ? name : <Skeleton width="10rem" height="1.25rem" />}
      description={
        <>
          {candidate?.headline}
          <JobLine job={job} />
        </>
      }
      contentKey={applicationId}
      headerActions={
        (onPrevious || onNext) && (
          <div className="pipeline-drawer-nav">
            <IconButton
              icon="chevron-up"
              size="sm"
              aria-label="Previous applicant"
              disabled={!onPrevious}
              onClick={onPrevious}
            />
            <IconButton
              icon="chevron-down"
              size="sm"
              aria-label="Next applicant"
              disabled={!onNext}
              onClick={onNext}
            />
          </div>
        )
      }
      footer={application && <DrawerFooter application={application} />}
    >
      {fetched.error ? (
        <ErrorNotice error={fetched.error} />
      ) : !application ? (
        <SkeletonText lines={8} />
      ) : (
        <div className="pipeline-drawer">
          <ProfileSection application={application} candidate={candidate} />
          <StageSection application={application} name={name} onRequestMove={onRequestMove} />
          <MatchSection application={application} candidate={candidate} job={job} />
          <CoverLetterSection application={application} />
          <ActivitySection application={application} />
        </div>
      )}
    </Drawer>
  );
}

/**
 * Which job this application is for. It sits in the header, so it stays in view while
 * the body scrolls — and when prev/next steps across jobs (the cross-job queue), the
 * score and stage buttons below are never read against the wrong one.
 */
function JobLine({ job }: { job: Job }) {
  return (
    <span className="row">
      <Icon name="briefcase" size={12} />
      <span>
        For <Link to={`/jobs/${job.id}`}>{job.title}</Link>
        {job.department && ` · ${job.department}`}
      </span>
    </span>
  );
}

function DrawerSection({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="pipeline-drawer-section">
      <div className="row-between">
        <h3 className="pipeline-drawer-heading">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function ProfileSection({ application, candidate }: { application: Application; candidate: Candidate | undefined }) {
  if (!candidate) {
    return (
      <div className="row">
        <Skeleton circle width="3.5rem" height="3.5rem" />
        <div className="stack-sm pipeline-drawer-grow">
          <Skeleton width="60%" />
          <Skeleton width="40%" />
        </div>
      </div>
    );
  }

  return (
    <div className="pipeline-profile">
      <Avatar name={applicantName(candidate)} size="xl" />
      <dl className="pipeline-facts">
        <div>
          <dt>
            <Icon name="mail" label="Email" />
          </dt>
          <dd className="row">
            <a href={`mailto:${candidate.email}`} className="truncate">
              {candidate.email}
            </a>
            <CopyButton value={candidate.email} label="email" />
          </dd>
        </div>
        {candidate.phone && (
          <div>
            <dt>
              <Icon name="phone" label="Phone" />
            </dt>
            <dd>
              <a href={`tel:${candidate.phone}`}>{candidate.phone}</a>
            </dd>
          </div>
        )}
        <div>
          <dt>
            <Icon name="briefcase" label="Experience" />
          </dt>
          <dd>{formatYears(candidate.years_experience)} of experience</dd>
        </div>
        {candidate.resume_url && (
          <div>
            <dt>
              <Icon name="file-text" label="Resume" />
            </dt>
            <dd>
              <a href={candidate.resume_url} target="_blank" rel="noreferrer" className="row">
                Resume <Icon name="external-link" size={12} />
              </a>
            </dd>
          </div>
        )}
        <div>
          <dt>
            <Icon name="clock" label="Applied" />
          </dt>
          <dd title={formatDateTime(application.created_at)}>Applied {formatRelative(application.created_at)}</dd>
        </div>
      </dl>
    </div>
  );
}

function StageSection({
  application,
  name,
  onRequestMove,
}: {
  application: Application;
  name: string;
  onRequestMove: CandidateDrawerProps["onRequestMove"];
}) {
  const terminal = TERMINAL_STAGES.has(application.stage);
  // Where a closed application stopped lives in its history; only fetched when needed.
  const { data: history } = useApplicationHistory(application.id, terminal);
  const targets = recruiterTargets(application.stage);

  return (
    <DrawerSection title="Stage" aside={<StagePill stage={application.stage} />}>
      <StageStepper stage={application.stage} stoppedAt={stoppedAt(history)} />
      {targets.length > 0 ? (
        <div className="button-row">
          {targets.map((stage) => (
            <Button
              key={stage}
              size="sm"
              variant={stage === "rejected" ? "ghost" : "secondary"}
              leftIcon={stage === "rejected" ? "x-circle" : "arrow-right"}
              className={stage === "rejected" ? "pipeline-reject" : undefined}
              onClick={() => onRequestMove(application, stage)}
            >
              {moveLabel(stage)}
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-sm muted">
          {application.stage === "hired"
            ? `${name} was hired — this application is complete.`
            : application.stage === "withdrawn"
              ? `${name} withdrew this application.`
              : "This application is closed."}
        </p>
      )}
    </DrawerSection>
  );
}

function MatchSection({
  application,
  candidate,
  job,
}: {
  application: Application;
  candidate: Candidate | undefined;
  job: Job;
}) {
  const { data: content } = useJobContent(job.id, job.content_processed_at);
  const score = application.match_score;
  const mentioned = job.content_processed_at ? content?.extracted_skills.map((s) => s.name) : [];
  const explanation = candidate ? explainScore(candidate, job, mentioned) : undefined;
  const match = skillMatch(candidate?.skills, job.required_skills);
  const required = new Set((job.required_skills ?? []).map((s) => s.toLowerCase()));
  const extra = (candidate?.skills ?? []).filter((s) => !required.has(s.toLowerCase()));

  return (
    <DrawerSection title="Match">
      <div className="pipeline-score">
        <ScoreRing score={score} size={56} strokeWidth={5} />
        <div>
          <p className="pipeline-score-verdict">{scoreVerdict(score)}</p>
          <p className="text-sm muted">
            {score === null || score === undefined
              ? TERMINAL_STAGES.has(application.stage)
                ? "This application closed before it was scored."
                : "Scoring runs a moment after applying. If it does not appear, re-run it below."
              : `${score.toFixed(1)} out of 100, ranked against this job only.`}
          </p>
        </div>
      </div>

      {explanation && (
        <ul className="pipeline-factors" aria-label="How the score is made up">
          {explanation.factors.map((factor) => (
            <li key={factor.key} className="pipeline-factor">
              <div className="row-between text-sm">
                <span>
                  {factor.label} <span className="subtle">· {Math.round(factor.weight * 100)}%</span>
                </span>
                <span className="tabular muted">
                  {factor.share === null ? "—" : `+${(factor.weight * factor.share * 100).toFixed(1)}`}
                </span>
              </div>
              <div className="pipeline-factor-track" aria-hidden="true">
                <div
                  className="pipeline-factor-fill"
                  style={{ width: `${(factor.share ?? 0) * 100}%` }}
                />
              </div>
              <p className="text-xs subtle">{factor.detail}</p>
            </li>
          ))}
        </ul>
      )}
      {explanation && scoreIsStale(score, explanation.estimate) && (
        <p className="text-xs pipeline-stale">
          <Icon name="info" size={12} /> Their profile has changed since this was scored (it would
          be {explanation.estimate?.toFixed(1)} now). Re-run scoring to refresh it.
        </p>
      )}

      <div className="stack-sm">
        <h4 className="mini-head">Skills against this job</h4>
        {(job.required_skills ?? []).length === 0 ? (
          <p className="text-sm muted">This job lists no required skills.</p>
        ) : (
          <div className="tag-list" aria-label="Required skills">
            {match.matched.map((skill) => (
              <span key={skill} className="tag match">
                <Icon name="check" size={12} label="Has" /> {skill}
              </span>
            ))}
            {match.missing.map((skill) => (
              <span key={skill} className="tag missing">
                <Icon name="minus" size={12} label="Missing" /> {skill}
              </span>
            ))}
          </div>
        )}
        {extra.length > 0 && (
          <>
            <h4 className="mini-head">Also brings</h4>
            <div className="tag-list">
              {extra.map((skill) => (
                <span key={skill} className="tag">
                  {skill}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </DrawerSection>
  );
}

function CoverLetterSection({ application }: { application: Application }) {
  return (
    <DrawerSection title="Cover letter">
      {application.cover_letter?.trim() ? (
        <blockquote className="pipeline-letter prewrap">{application.cover_letter}</blockquote>
      ) : (
        <p className="text-sm muted">No cover letter — they applied with their profile alone.</p>
      )}
    </DrawerSection>
  );
}

function ActivitySection({ application }: { application: Application }) {
  const history = useApplicationHistory(application.id, true);
  const notifications = useApplicationNotifications(application.id, true);

  const historyItems: TimelineItem[] = [...(history.data ?? [])].reverse().map((change, index) => ({
    id: `${change.changed_at}-${index}`,
    icon: change.from_stage === null ? "send" : change.to_stage === "rejected" ? "x-circle" : "arrow-right",
    tone:
      change.to_stage === "hired"
        ? "success"
        : change.to_stage === "rejected" || change.to_stage === "withdrawn"
          ? "danger"
          : "accent",
    title: change.from_stage === null ? "Applied" : `${humanize(change.from_stage)} → ${humanize(change.to_stage)}`,
    meta: <time title={formatDateTime(change.changed_at)}>{formatRelative(change.changed_at)}</time>,
    body: change.note ? <q className="pipeline-note">{change.note}</q> : undefined,
  }));

  const messageItems: TimelineItem[] = [...(notifications.data ?? [])].reverse().map((message, index) => ({
    id: `${message.sent_at}-${index}`,
    icon: "mail",
    tone: "info",
    title: message.subject,
    meta: (
      <>
        {humanize(message.channel)} to {message.recipient} ·{" "}
        <time title={formatDateTime(message.sent_at)}>{formatRelative(message.sent_at)}</time>
      </>
    ),
  }));

  return (
    <>
      <DrawerSection title="Stage history">
        <ErrorNotice error={history.error} />
        {history.isLoading ? (
          <SkeletonText lines={3} />
        ) : (
          <Timeline items={historyItems} aria-label="Stage history, newest first" />
        )}
      </DrawerSection>
      <DrawerSection title="Messages sent">
        <ErrorNotice error={notifications.error} />
        {notifications.isLoading ? (
          <SkeletonText lines={2} />
        ) : messageItems.length === 0 ? (
          <EmptyState
            compact
            icon="mail"
            title="No messages yet"
            description="The confirmation goes out a moment after applying. Stage changes are not emailed; the candidate sees the new stage on their applications page."
          />
        ) : (
          <Timeline items={messageItems} aria-label="Messages sent, newest first" />
        )}
      </DrawerSection>
    </>
  );
}

function DrawerFooter({ application }: { application: Application }) {
  const process = useProcessApplication();
  const toast = useToast();

  function rerun() {
    // Safe to repeat: the score is recomputed and the confirmation is never sent twice.
    toast
      .promise(process.mutateAsync(application.id), {
        loading: "Re-running scoring…",
        success: "Scoring queued — the score updates in a moment.",
      })
      .catch(() => {
        // Already reported by the toast.
      });
  }

  return (
    <>
      <Button variant="ghost" leftIcon="refresh" loading={process.isPending} onClick={rerun}>
        Re-run scoring
      </Button>
      <span className="spacer" />
      <ButtonLink to={`/candidates/${application.candidate_id}`} rightIcon="arrow-up-right">
        Full profile
      </ButtonLink>
    </>
  );
}
