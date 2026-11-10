import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { ApiError } from "../../api/client";
import {
  COVER_LETTER_MAX_LENGTH,
  MAX_ACTIVE_APPLICATIONS,
  TERMINAL_STAGES,
  type Application,
  type Candidate,
  type Job,
} from "../../api/types";
import { keys, useApplicationHistory, useApplyToJob } from "../../hooks/queries";
import { useMyApplications } from "../../hooks/useCandidateExtras";
import { useIdempotencyKey } from "../../hooks/useIdempotencyKey";
import { CandidateStagePill } from "../candidate/CandidateStagePill";
import { STAGE_COPY } from "../candidate/stageCopy";
import { useWithdraw } from "../candidate/useWithdraw";
import { CardError } from "../dashboard/parts";
import {
  Button,
  ButtonLink,
  Card,
  ErrorNotice,
  Field,
  Icon,
  Notice,
  ProgressBar,
  SkeletonText,
  StageStepper,
  Textarea,
  eligibility,
  formatDateTime,
  formatRelative,
  pluralize,
  stoppedAt,
} from "../ui";

/**
 * The server words these refusals for operators ("the candidate", a job id). An
 * applicant needs them in the second person, without the error code. The cap's number
 * is left out because the server owns that setting.
 */
const APPLY_ERROR_COPY: Partial<Record<string, { title: string; message: string }>> = {
  duplicate_application: { title: "Already applied", message: "You've already applied to this role." },
  not_eligible: {
    title: "Not eligible yet",
    message: "Your profile doesn't meet this role's requirements yet. Update it and try again.",
  },
  application_limit_reached: {
    title: "Application limit reached",
    message: "You're at the limit for applications in progress. Withdraw one you no longer want to apply here.",
  },
  job_capacity_reached: {
    title: "This role is full",
    message: "This role has received all the applications it can take.",
  },
  job_not_open: { title: "Applications closed", message: "This role has stopped accepting applications." },
  not_found: { title: "No longer available", message: "This role is no longer available." },
};

/** The cover letter survives a trip to /profile to fix eligibility (the panel sends
 * candidates there itself), and is dropped once the application is in. */
const draftKey = (jobId: string) => `smarthire.applyDraft.${jobId}`;

function readDraft(jobId: string): string {
  try {
    return window.sessionStorage.getItem(draftKey(jobId)) ?? "";
  } catch {
    return "";
  }
}

function saveDraft(jobId: string, text: string) {
  try {
    if (text.trim()) window.sessionStorage.setItem(draftKey(jobId), text);
    else window.sessionStorage.removeItem(draftKey(jobId));
  } catch {
    // Storage is blocked (private mode): the draft lasts as long as the page.
  }
}

export interface ApplyPanelProps {
  job: Job;
  /** The signed-in candidate's profile, for the eligibility preview; undefined while it loads. */
  candidate: Candidate | undefined;
  /** Why the profile could not be read; without it the panel cannot say anything. */
  profileError: unknown;
  onRetryProfile: () => void;
}

/**
 * The candidate's side of a job: apply, or follow the application already made.
 *
 * Every rule the server enforces — eligible, under the active-application limit, job
 * still open, not applied before — is previewed here so a refusal is rarely a
 * surprise, but the server still decides: its answer comes back as a typed error and
 * is shown as guidance, not as a crash.
 */
export function ApplyPanel({ job, candidate, profileError, onRetryProfile }: ApplyPanelProps) {
  const mine = useMyApplications();
  // The server's answer to a submit: shown at once, before the list refetches with it.
  const [submitted, setSubmitted] = useState<Application | null>(null);

  // A failed read says why, with a retry, rather than a skeleton that never resolves.
  const loadError = profileError ?? (mine.data ? null : mine.error);
  if (loadError) {
    return (
      <Card className="job-detail-apply">
        <CardError
          error={loadError}
          onRetry={profileError ? onRetryProfile : () => void mine.refetch()}
        />
      </Card>
    );
  }

  if (!candidate || mine.isLoading) {
    return (
      <Card className="job-detail-apply">
        <SkeletonText lines={5} />
      </Card>
    );
  }

  const existing = mine.data?.items.find((application) => application.job_id === job.id) ?? submitted;
  if (existing) {
    return (
      <AppliedCard
        application={existing}
        jobTitle={job.title}
        justApplied={submitted !== null}
        email={candidate.email}
      />
    );
  }

  if (job.status !== "published") {
    return (
      <Card className="job-detail-apply">
        <Notice tone="rule" title="Not accepting applications">
          This job has closed. Browse the open roles for something similar.
        </Notice>
        <ButtonLink to="/jobs" block>
          Browse open jobs
        </ButtonLink>
      </Card>
    );
  }

  const active = mine.data?.items.filter((a) => !TERMINAL_STAGES.has(a.stage)).length ?? 0;
  return <ApplyForm job={job} candidate={candidate} active={active} onApplied={setSubmitted} />;
}

function ApplyForm({
  job,
  candidate,
  active,
  onApplied,
}: {
  job: Job;
  candidate: Candidate;
  active: number;
  onApplied: (application: Application) => void;
}) {
  const [coverLetter, setCoverLetter] = useState(() => readDraft(job.id));
  // Same input and no answer yet: same key, so pressing Submit again after a timeout
  // cannot apply twice. Any answer settles the key; the next submit gets a fresh one.
  const { key: idempotencyKey, settle } = useIdempotencyKey({ jobId: job.id, coverLetter });
  const apply = useApplyToJob(job.id);
  const client = useQueryClient();

  useEffect(() => saveDraft(job.id, coverLetter), [job.id, coverLetter]);

  const check = eligibility(candidate, job);
  const atLimit = active >= MAX_ACTIVE_APPLICATIONS;
  // The eligibility check mirrors the server's rule, so submitting would only earn a
  // refusal. The cap stays a warning: the server owns that number and may change it.
  const blocked = !check.eligible;

  function submit(event: FormEvent) {
    event.preventDefault();
    // The button is not the only way to submit a form.
    if (blocked) return;
    apply.mutate(
      { payload: { cover_letter: coverLetter.trim() || null }, idempotencyKey },
      {
        onSettled: (_data, error) => settle(error),
        onSuccess: (application) => {
          saveDraft(job.id, "");
          onApplied(application);
        },
        // These refusals mean the page is out of date. Re-reading what changed moves
        // the panel on to the existing application or the closed notice.
        onError: (error) => {
          if (!(error instanceof ApiError)) return;
          if (error.code === "duplicate_application") {
            saveDraft(job.id, "");
            void client.invalidateQueries({ queryKey: keys.applications });
          }
          if (error.code === "job_not_open" || error.code === "not_found") {
            void client.invalidateQueries({ queryKey: keys.job(job.id) });
          }
        },
      },
    );
  }

  const refusal = apply.error instanceof ApiError ? APPLY_ERROR_COPY[apply.error.code] : undefined;

  return (
    <Card className="job-detail-apply">
      <h2 className="job-detail-apply-title">Apply for this role</h2>

      {check.eligible ? (
        <Notice tone="success" title="You meet the requirements">
          {(job.required_skills ?? []).length > 0
            ? `You have ${check.match.matched.length} of the ${check.match.matched.length + check.match.missing.length} skills listed.`
            : "This role lists no required skills."}
        </Notice>
      ) : (
        <Notice
          tone="rule"
          title="Your profile does not meet the requirements yet"
          action={
            <ButtonLink to="/profile" size="sm">
              Update your profile
            </ButtonLink>
          }
        >
          <ul className="job-detail-reasons">
            {check.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </Notice>
      )}

      <div className="stack-sm">
        <div className="row-between text-sm">
          <span className="muted">Active applications</span>
          <span className="tabular">
            {active} of {MAX_ACTIVE_APPLICATIONS}
          </span>
        </div>
        <ProgressBar
          size="sm"
          label="Active applications used"
          value={active}
          max={MAX_ACTIVE_APPLICATIONS}
          valueText={`${active} of ${MAX_ACTIVE_APPLICATIONS}`}
          tone={atLimit ? "danger" : active >= MAX_ACTIVE_APPLICATIONS - 2 ? "warning" : "accent"}
        />
        {atLimit && (
          <p className="text-xs job-detail-warning">
            You are at the limit. Withdraw an application you are no longer interested in to apply here.
          </p>
        )}
        {job.max_applications != null && (
          <p className="text-xs subtle">
            This role takes up to {pluralize(job.max_applications, "application")} in total.
          </p>
        )}
      </div>

      <form className="stack" onSubmit={submit}>
        <Field
          label="Cover letter"
          optional
          hint="A few lines on why this role, in your own words. The team reads it alongside your profile."
        >
          <Textarea
            rows={6}
            value={coverLetter}
            maxLength={COVER_LETTER_MAX_LENGTH}
            showCount
            placeholder={`Why ${job.title}?`}
            onChange={(event) => setCoverLetter(event.target.value)}
          />
        </Field>
        {refusal ? (
          <Notice tone="rule" title={refusal.title}>
            {refusal.message}
          </Notice>
        ) : (
          <ErrorNotice error={apply.error} />
        )}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          block
          leftIcon="send"
          loading={apply.isPending}
          disabled={blocked}
          aria-describedby={blocked ? "apply-blocked-reason" : undefined}
        >
          Submit application
        </Button>
        {blocked && (
          <p id="apply-blocked-reason" className="text-xs subtle">
            Update your profile to meet the requirements, then apply.
          </p>
        )}
        <p className="text-xs subtle job-detail-fineprint">
          Your <Link to="/profile">profile</Link> ({candidate.email}) is shared with the hiring team.
        </p>
      </form>
    </Card>
  );
}

function AppliedCard({
  application,
  jobTitle,
  justApplied,
  email,
}: {
  application: Application;
  jobTitle: string;
  justApplied: boolean;
  email: string;
}) {
  const terminal = TERMINAL_STAGES.has(application.stage);
  // Where a closed application stopped is in its history; candidates may read their own.
  const { data: history } = useApplicationHistory(application.id, terminal);
  // The same confirmation and outcome as My applications, so withdrawing reads alike.
  const { withdraw, pendingId } = useWithdraw();
  const copy = STAGE_COPY[application.stage];

  return (
    <Card className="job-detail-apply">
      {justApplied ? (
        <div className="job-detail-sent" role="status">
          <span className="job-detail-sent-icon" aria-hidden="true">
            <Icon name="check" size={20} strokeWidth={3} />
          </span>
          <div>
            <h2 className="job-detail-apply-title">Application sent</h2>
            <p className="text-sm muted">A confirmation is on its way to {email}.</p>
          </div>
        </div>
      ) : (
        <div className="row-between">
          <h2 className="job-detail-apply-title">Your application</h2>
          <CandidateStagePill stage={application.stage} />
        </div>
      )}

      <StageStepper stage={application.stage} stoppedAt={stoppedAt(history)} />
      <p className="text-sm">
        <strong>{copy.headline}.</strong> {copy.next}
      </p>
      <p className="text-xs subtle" title={formatDateTime(application.created_at)}>
        Applied {formatRelative(application.created_at)}
        {application.updated_at !== application.created_at && ` · updated ${formatRelative(application.updated_at)}`}
      </p>

      <div className="stack-sm">
        {/* Opens the list with this application's details already showing. */}
        <ButtonLink
          to={`/applications?app=${encodeURIComponent(application.id)}`}
          variant={justApplied ? "primary" : "secondary"}
          block
          rightIcon="arrow-right"
        >
          Track it in My applications
        </ButtonLink>
        {justApplied && (
          <ButtonLink to="/jobs" variant="ghost" block>
            Browse more jobs
          </ButtonLink>
        )}
        {!terminal && !justApplied && (
          <Button
            variant="ghost"
            block
            loading={pendingId === application.id}
            onClick={() => void withdraw(application.id, jobTitle)}
          >
            Withdraw application
          </Button>
        )}
      </div>
    </Card>
  );
}
