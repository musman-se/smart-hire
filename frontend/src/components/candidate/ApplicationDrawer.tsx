import type { Application, Job, StageChange } from "../../api/types";
import { useApplicationHistory, useApplicationNotifications } from "../../hooks/queries";
import {
  Button,
  ButtonLink,
  Drawer,
  EmptyState,
  ErrorNotice,
  Icon,
  SkeletonText,
  StageStepper,
  Tags,
  Timeline,
  formatDate,
  formatDateTime,
  formatRelative,
  formatYears,
  stoppedAt,
  type TimelineItem,
} from "../ui";
import { isActive } from "./applications";
import { JobMeta } from "./JobMeta";
import { UNLISTED_JOB } from "./JobTitle";
import { STAGE_COPY } from "./stageCopy";

export interface ApplicationDrawerProps {
  application: Application | undefined;
  job: Job | undefined;
  jobLoading?: boolean;
  /** The candidate's skills, to highlight the ones the role asks for. */
  skills?: readonly string[];
  withdrawing?: boolean;
  onClose: () => void;
  onWithdraw: () => void;
}

function When({ at }: { at: string }) {
  return (
    <time dateTime={at} title={formatDateTime(at)}>
      {formatRelative(at)}
    </time>
  );
}

function historyItems(history: readonly StageChange[]): TimelineItem[] {
  return history.map((change, index) => {
    const copy = STAGE_COPY[change.to_stage];
    return {
      id: String(index),
      icon: copy.icon,
      tone: copy.tone,
      title: change.from_stage === null ? "You applied" : copy.headline,
      meta: <When at={change.changed_at} />,
    };
  });
}

/**
 * Everything about one application, without leaving the list: where it stands, each
 * move so far, the messages sent about it, and what the candidate sent. The hiring
 * team's notes are not here because the API never gives them to candidates.
 */
export function ApplicationDrawer({
  application,
  job,
  jobLoading,
  skills,
  withdrawing,
  onClose,
  onWithdraw,
}: ApplicationDrawerProps) {
  const id = application?.id ?? "";
  const history = useApplicationHistory(id, Boolean(application));
  const messages = useApplicationNotifications(id, Boolean(application));

  const open = Boolean(application);
  const active = application ? isActive(application) : false;
  const copy = application ? STAGE_COPY[application.stage] : undefined;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size="lg"
      title={job?.title ?? (jobLoading ? "Application" : UNLISTED_JOB)}
      description={application && `Applied ${formatDate(application.created_at)}`}
      footer={
        <>
          {job && (
            <ButtonLink to={`/jobs/${job.id}`} variant="secondary" leftIcon="briefcase">
              View job posting
            </ButtonLink>
          )}
          {active && (
            <Button variant="danger" leftIcon="x-circle" loading={withdrawing} onClick={onWithdraw}>
              Withdraw
            </Button>
          )}
        </>
      }
    >
      {application && copy && (
        <div className="candidate-drawer">
          <div className="candidate-drawer-status" data-tone={copy.tone}>
            <span className="candidate-drawer-status-icon" aria-hidden="true">
              <Icon name={copy.icon} size={18} />
            </span>
            <div>
              <p className="candidate-drawer-status-title">{copy.headline}</p>
              <p className="candidate-drawer-status-next">{copy.next}</p>
            </div>
          </div>

          <StageStepper stage={application.stage} stoppedAt={stoppedAt(history.data)} />

          {job?.status === "closed" && (
            <p className="candidate-drawer-note">
              <Icon name="info" size={14} />
              This role has stopped taking new applications.
              {active && " The team can still move yours forward."}
            </p>
          )}

          <section className="candidate-drawer-section" aria-labelledby="candidate-drawer-progress">
            <h3 id="candidate-drawer-progress" className="candidate-drawer-heading">
              Progress
            </h3>
            {history.isLoading ? (
              <SkeletonText lines={3} />
            ) : history.error ? (
              <ErrorNotice error={history.error} />
            ) : (
              <>
                <Timeline items={historyItems(history.data ?? [])} aria-label="Application progress" />
                <p className="candidate-drawer-fineprint">
                  Every move is listed with its date. Reviewers' internal notes stay private.
                </p>
              </>
            )}
          </section>

          <section className="candidate-drawer-section" aria-labelledby="candidate-drawer-messages">
            <h3 id="candidate-drawer-messages" className="candidate-drawer-heading">
              Messages
              {messages.data && messages.data.length > 0 && (
                <span className="candidate-drawer-count">{messages.data.length}</span>
              )}
            </h3>
            {messages.isLoading ? (
              <SkeletonText lines={2} />
            ) : messages.error ? (
              <ErrorNotice error={messages.error} />
            ) : messages.data && messages.data.length > 0 ? (
              <ul className="candidate-messages">
                {messages.data.map((message, index) => (
                  <li key={`${message.sent_at}-${index}`}>
                    <details className="candidate-message" open={index === 0}>
                      <summary>
                        <Icon name="mail" size={14} />
                        <span className="candidate-message-subject">{message.subject}</span>
                        <span className="candidate-message-date">
                          <When at={message.sent_at} />
                        </span>
                        <Icon name="chevron-down" size={14} className="candidate-message-chevron" />
                      </summary>
                      <p className="candidate-message-body prewrap">{message.body}</p>
                      <p className="candidate-message-meta">
                        Sent by {message.channel} to {message.recipient}
                      </p>
                    </details>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                compact
                icon="mail"
                title="No messages yet"
                description="Every email sent about this application shows up here too."
              />
            )}
          </section>

          <section className="candidate-drawer-section" aria-labelledby="candidate-drawer-letter">
            <h3 id="candidate-drawer-letter" className="candidate-drawer-heading">
              Your cover letter
            </h3>
            {application.cover_letter?.trim() ? (
              <blockquote className="candidate-letter prewrap">{application.cover_letter}</blockquote>
            ) : (
              <p className="muted">You applied without a cover letter.</p>
            )}
          </section>

          {job && (
            <section className="candidate-drawer-section" aria-labelledby="candidate-drawer-role">
              <h3 id="candidate-drawer-role" className="candidate-drawer-heading">
                About the role
              </h3>
              <div className="stack-sm">
                <JobMeta job={job} />
                {job.min_experience_years > 0 && (
                  <span className="muted text-sm">
                    Asks for {formatYears(job.min_experience_years)} of experience
                  </span>
                )}
                {job.required_skills?.length ? (
                  <Tags items={job.required_skills} highlight={skills} max={8} />
                ) : (
                  <span className="muted text-sm">Open to any skill set</span>
                )}
              </div>
            </section>
          )}
        </div>
      )}
    </Drawer>
  );
}
