import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ApiError } from "../api/client";
import {
  NEXT_STAGES,
  TERMINAL_STAGES,
  type Application,
  type Candidate,
  type Job,
} from "../api/types";
import {
  Empty,
  ErrorNotice,
  StagePill,
  StatusPill,
  Tags,
  formatDate,
  formatDateTime,
} from "../components/ui";
import {
  useAdvanceStage,
  useApplicationHistory,
  useApplicationNotifications,
  useApplyToJob,
  useCandidates,
  useJob,
  useJobApplications,
  useJobContent,
  useJobPublication,
  useJobTransition,
  useProcessApplication,
  useWithdrawApplication,
} from "../hooks/queries";
import { useIdempotencyKey } from "../hooks/useIdempotencyKey";

const TEMPORAL_UI_URL = import.meta.env.VITE_TEMPORAL_UI_URL ?? "http://localhost:8233";

/**
 * The panel that demonstrates the backend's rules.
 *
 * Every rejection path — duplicate, not eligible, limit reached, job full, job closed —
 * comes back as a typed error code and is rendered as guidance rather than a crash. This
 * is the screen worth demoing in the review.
 */
function ApplyPanel({ jobId, jobSkills }: { jobId: string; jobSkills: string[] }) {
  const [candidateId, setCandidateId] = useState("");
  const [coverLetter, setCoverLetter] = useState("");
  // Same input and no answer yet: same key, so re-pressing Submit after a timeout
  // cannot apply twice. Any answer settles the key; the next submit gets a fresh one.
  const { key: idempotencyKey, settle } = useIdempotencyKey({ jobId, candidateId, coverLetter });

  // A long candidate list would need a search-as-you-type picker; at this scale a
  // single page of 100 is honest and simple.
  const { data: candidates } = useCandidates({ limit: 100, offset: 0 });
  const apply = useApplyToJob(jobId);

  const selected = candidates?.items.find((c) => c.id === candidateId);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!candidateId) return;

    apply.mutate(
      {
        payload: { candidate_id: candidateId, cover_letter: coverLetter || null },
        idempotencyKey,
      },
      {
        onSettled: (_data, error) => settle(error),
        onSuccess: () => {
          setCandidateId("");
          setCoverLetter("");
        },
      },
    );
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Add an applicant</h2>
      </div>

      <form onSubmit={submit} className="form-grid">
        <div className="field">
          <label htmlFor="candidate">Candidate</label>
          <select
            id="candidate"
            value={candidateId}
            onChange={(e) => setCandidateId(e.target.value)}
            required
          >
            <option value="">Select a candidate…</option>
            {candidates?.items.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.full_name} · {candidate.years_experience}y
              </option>
            ))}
          </select>
        </div>

        {selected && <EligibilityHint candidate={selected} jobSkills={jobSkills} />}

        <div className="field">
          <label htmlFor="cover">Cover letter</label>
          <textarea
            id="cover"
            value={coverLetter}
            onChange={(e) => setCoverLetter(e.target.value)}
            placeholder="Optional"
            style={{ minHeight: "4rem" }}
          />
        </div>

        <div>
          <button type="submit" className="primary" disabled={!candidateId || apply.isPending}>
            {apply.isPending ? "Submitting…" : "Submit application"}
          </button>
        </div>
      </form>

      <ErrorNotice error={apply.error} />
      {apply.isSuccess && (
        <div className="notice notice-success">
          <strong>Application submitted</strong>
          It starts in the <code>applied</code> stage. Its match score and the candidate's
          confirmation follow in a moment, from the ProcessApplication workflow.
        </div>
      )}
    </div>
  );
}

/**
 * A preview of what the server will decide — never a replacement for it.
 *
 * The client can hint, but the server owns the rule. If this hint and the API ever
 * disagree, the API is right and the hint is a bug.
 */
function EligibilityHint({ candidate, jobSkills }: { candidate: Candidate; jobSkills: string[] }) {
  const candidateSkills = candidate.skills ?? [];
  const overlap = candidateSkills.filter((skill) => jobSkills.includes(skill));

  return (
    <div className="field">
      <label>Candidate skills</label>
      <div>
        <Tags items={candidateSkills} highlight={jobSkills} />
      </div>
      <span className="field-hint">
        {jobSkills.length === 0
          ? "This job lists no required skills."
          : overlap.length > 0
            ? `Matches ${overlap.length} of ${jobSkills.length} required skills.`
            : "No overlapping skills — the server will reject this as not eligible."}
      </span>
    </div>
  );
}

function MatchScore({ application }: { application: Application }) {
  const process = useProcessApplication();

  if (application.match_score !== null && application.match_score !== undefined) {
    const tone =
      application.match_score >= 75 ? "high" : application.match_score >= 50 ? "mid" : "low";
    return <span className={`score score-${tone}`}>{application.match_score.toFixed(1)}</span>;
  }
  if (TERMINAL_STAGES.has(application.stage)) return <span className="muted">—</span>;

  // Unscored and active: either the workflow is about to finish, or it never started
  // (the engine was down). The button is the recovery path either way, and safe to
  // press twice — scoring is recomputed and the confirmation never sent twice.
  return (
    <>
      <button
        type="button"
        className="small ghost"
        title="Run scoring and the confirmation message (POST /applications/{id}/process)"
        disabled={process.isPending}
        onClick={() => process.mutate(application.id)}
      >
        {process.isPending ? "…" : "score"}
      </button>
      {process.error && (
        <span className="inline-error" title={process.error.message}>
          {process.error instanceof ApiError ? process.error.code : "failed"}
        </span>
      )}
    </>
  );
}

/** The application's history and the messages sent about it, loaded on demand. */
function ApplicationTimeline({ applicationId }: { applicationId: string }) {
  const { data: history } = useApplicationHistory(applicationId, true);
  const { data: notifications } = useApplicationNotifications(applicationId, true);

  return (
    <div className="timeline-grid">
      <div>
        <h3 className="mini-head">Stage history</h3>
        <ol className="timeline">
          {history?.map((change, index) => (
            <li key={index}>
              <span className="timeline-when">{formatDateTime(change.changed_at)}</span>
              <span>
                {change.from_stage ? <StagePill stage={change.from_stage} /> : <em>new</em>}
                {" → "}
                <StagePill stage={change.to_stage} />
              </span>
              {change.note && <span className="timeline-note">{change.note}</span>}
            </li>
          ))}
        </ol>
      </div>
      <div>
        <h3 className="mini-head">Messages sent</h3>
        {notifications && notifications.length > 0 ? (
          <ul className="timeline">
            {notifications.map((n, index) => (
              <li key={index}>
                <span className="timeline-when">{formatDateTime(n.sent_at)}</span>
                <span>
                  <span className="tag">{n.channel}</span> {n.subject}
                </span>
                <span className="timeline-note">to {n.recipient}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">None yet.</p>
        )}
      </div>
    </div>
  );
}

function ApplicationRow({ application }: { application: Application }) {
  const advance = useAdvanceStage();
  const withdraw = useWithdrawApplication();
  const [expanded, setExpanded] = useState(false);
  // Withdrawal is the candidate's action and has its own button; the stage buttons are
  // the recruiter's.
  const nextStages = NEXT_STAGES[application.stage].filter((stage) => stage !== "withdrawn");
  const terminal = TERMINAL_STAGES.has(application.stage);

  return (
    <>
      <tr>
        <td>
          <Link to={`/candidates/${application.candidate_id}`} className="mono">
            {application.candidate_id.slice(0, 8)}
          </Link>
        </td>
        <td>
          <StagePill stage={application.stage} />
        </td>
        <td className="muted">{formatDate(application.created_at)}</td>
        <td>
          <MatchScore application={application} />
        </td>
        <td className="actions">
          <div className="button-row" style={{ justifyContent: "flex-end" }}>
            {/* Only legal transitions are offered — the stage machine mirrored from the
                backend. The server still enforces it. */}
            {nextStages.map((stage) => (
              <button
                key={stage}
                type="button"
                className={stage === "rejected" ? "small danger" : "small"}
                disabled={advance.isPending}
                onClick={() => advance.mutate({ id: application.id, stage })}
              >
                {stage}
              </button>
            ))}
            {terminal && <span className="muted">final</span>}
            {!terminal && (
              <button
                type="button"
                className="small ghost"
                onClick={() => withdraw.mutate(application.id)}
              >
                Withdraw
              </button>
            )}
            <button
              type="button"
              className="small ghost"
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? "Hide" : "History"}
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="row-detail">
          <td colSpan={5}>
            <ApplicationTimeline applicationId={application.id} />
          </td>
        </tr>
      )}
      {(advance.error || withdraw.error) && (
        <tr>
          <td colSpan={5}>
            <ErrorNotice error={advance.error ?? withdraw.error} />
          </td>
        </tr>
      )}
    </>
  );
}

const PUBLISH_STEPS = [
  { step: "analysing", label: "Extract skills & break down the description" },
  { step: "storing", label: "Store structured content" },
  { step: "marking_ready", label: "Mark the job ready" },
] as const;

/**
 * Where publishing is. The job's own status says what candidates see; the workflow's
 * status says what Temporal is doing — side by side, because they can differ (a job can
 * be closed while its workflow is still finishing).
 */
function PublishingPanel({ job }: { job: Job }) {
  const processing = job.status === "processing";
  const { data: publication, isFetched } = useJobPublication(job.id, job.status);
  const transition = useJobTransition(job.id);
  const run = publication?.workflow;
  const currentIndex = PUBLISH_STEPS.findIndex((s) => s.step === run?.current_step);
  // PROCESSING with no run in flight: the run ended without finishing the job, or never
  // started (the engine went down at the wrong moment). Publishing again starts a
  // fresh run — the documented recovery, offered right here.
  const stuck = processing && isFetched && run?.status !== "running";

  if (!run && !processing && job.status !== "publish_failed") return null;

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Publishing</h2>
        <span className="spacer" />
        {run && <span className={`pill pill-wf-${run.status}`}>workflow {run.status}</span>}
      </div>

      {processing && (
        <ol className="steps">
          {PUBLISH_STEPS.map((s, index) => (
            <li
              key={s.step}
              className={
                index < currentIndex ? "done" : index === currentIndex ? "current" : undefined
              }
            >
              {s.label}
            </li>
          ))}
        </ol>
      )}

      {stuck && (
        <div className="notice notice-rule">
          <strong>No workflow is running for this job</strong>
          It is still marked processing, but its last run {run ? `is ${run.status}` : "never started"}.
          <div style={{ marginTop: "0.5rem" }}>
            <button
              type="button"
              className="primary small"
              disabled={transition.isPending}
              onClick={() => transition.mutate("publish")}
            >
              Restart publishing
            </button>
          </div>
          <ErrorNotice error={transition.error} />
        </div>
      )}

      {job.status === "publish_failed" && (
        <div className="notice notice-error">
          <strong>Publishing failed — the job is not live</strong>
          <span className="mono">{job.publish_error ?? "No reason was recorded."}</span>
          <br />
          Fix the job if needed, then publish again.
        </div>
      )}

      <dl className="detail-list">
        {run && (
          <>
            <dt>Workflow</dt>
            <dd>
              <a
                href={`${TEMPORAL_UI_URL}/namespaces/default/workflows/${encodeURIComponent(run.workflow_id)}`}
                target="_blank"
                rel="noreferrer"
                className="mono"
              >
                {run.workflow_id}
              </a>
            </dd>
          </>
        )}
        <dt>Analysed</dt>
        <dd>{formatDateTime(job.content_processed_at)}</dd>
      </dl>
    </div>
  );
}

/** What the publishing workflow extracted from the description. */
function ContentPanel({ job }: { job: Job }) {
  const { data: content } = useJobContent(job.id, job.content_processed_at);
  if (!content) return null;

  const sections = [
    ["Summary", content.sections.summary],
    ["Responsibilities", content.sections.responsibilities],
    ["Requirements", content.sections.requirements],
    ["Benefits", content.sections.benefits],
  ] as const;

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Structured content</h2>
        <span className="spacer" />
        <span className="muted">extracted by the publishing workflow</span>
      </div>

      {sections.map(([title, items]) =>
        items.length === 0 ? null : (
          <div key={title} className="content-section">
            <h3 className="mini-head">{title}</h3>
            <ul>
              {items.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
        ),
      )}

      <h3 className="mini-head">Skills mentioned</h3>
      <div>
        {content.extracted_skills.length === 0 ? (
          <span className="muted">None recognised.</span>
        ) : (
          content.extracted_skills.map((s) => (
            <span key={s.name} className={job.required_skills?.includes(s.name) ? "tag match" : "tag"}>
              {s.name}
              {s.mentions > 1 && <sup> ×{s.mentions}</sup>}
            </span>
          ))
        )}
      </div>
      <span className="field-hint">Highlighted: also required. The rest feed search and scoring only.</span>

      <h3 className="mini-head" style={{ marginTop: "0.9rem" }}>
        Keywords
      </h3>
      <div className="keywords">
        {content.keywords.map((k) => (
          <span key={k.keyword} className="keyword" title={`weight ${k.score}`}>
            <span className="keyword-bar" style={{ width: `${Math.round(k.score * 100)}%` }} />
            {k.keyword}
          </span>
        ))}
      </div>
    </div>
  );
}

export function JobDetailPage() {
  const { jobId = "" } = useParams();
  const { data: job, isLoading, error } = useJob(jobId);
  const { data: applications } = useJobApplications(jobId);
  const transition = useJobTransition(jobId);

  if (isLoading) return <Empty>Loading…</Empty>;
  if (error) return <ErrorNotice error={error} />;
  if (!job) return <Empty>Job not found.</Empty>;

  return (
    <>
      <div className="breadcrumb">
        <Link to="/jobs">Jobs</Link> / {job.title}
      </div>

      <div className="page-head">
        <div>
          <h1>{job.title}</h1>
          <p>{[job.department, job.location].filter(Boolean).join(" · ") || "No location set"}</p>
        </div>
        <span className="spacer" />
        <div className="button-row">
          {(job.status === "draft" || job.status === "publish_failed") && (
            <button
              type="button"
              className="primary"
              disabled={transition.isPending}
              onClick={() => transition.mutate("publish")}
            >
              {job.status === "publish_failed" ? "Retry publishing" : "Publish"}
            </button>
          )}
          {job.status === "processing" && (
            <button type="button" className="primary" disabled>
              Publishing…
            </button>
          )}
          {job.status !== "closed" && job.status !== "draft" && (
            <button type="button" onClick={() => transition.mutate("close")}>
              Close
            </button>
          )}
          {job.status === "closed" && (
            <button type="button" onClick={() => transition.mutate("reopen")}>
              Reopen
            </button>
          )}
        </div>
      </div>

      <ErrorNotice error={transition.error} />

      <div className="grid-2">
        <div>
          <div className="panel">
            <div className="panel-head">
              <h2>Applications</h2>
              <span className="spacer" />
              <span className="muted">{applications?.total ?? 0} total</span>
            </div>

            {!applications || applications.items.length === 0 ? (
              <Empty>No applications yet.</Empty>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Candidate</th>
                      <th>Stage</th>
                      <th>Applied</th>
                      <th title="Match score, 0–100: required skills 60%, experience 25%, other mentioned skills 15%">
                        Score
                      </th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {applications.items.map((application) => (
                      <ApplicationRow key={application.id} application={application} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <ApplyPanel jobId={jobId} jobSkills={job.required_skills ?? []} />
        </div>

        <div>
          <PublishingPanel job={job} />

          <div className="panel">
            <div className="panel-head">
              <h2>Details</h2>
              <span className="spacer" />
              <StatusPill status={job.status} />
            </div>

            <dl className="detail-list">
              <dt>Employment</dt>
              <dd>{job.employment_type?.replace("_", " ")}</dd>

              <dt>Min. experience</dt>
              <dd>
                {job.min_experience_years} year{job.min_experience_years === 1 ? "" : "s"}
              </dd>

              <dt>Cap</dt>
              <dd>{job.max_applications ?? "Unlimited"}</dd>

              <dt>Published</dt>
              <dd>{formatDate(job.published_at)}</dd>

              <dt>Created</dt>
              <dd>{formatDate(job.created_at)}</dd>

              <dt>Required skills</dt>
              <dd>
                <Tags items={job.required_skills ?? []} />
              </dd>
            </dl>

            <h3 style={{ margin: "1.2rem 0 0.4rem" }}>Description</h3>
            <p className="muted" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
              {job.description}
            </p>
          </div>

          <ContentPanel job={job} />
        </div>
      </div>
    </>
  );
}
