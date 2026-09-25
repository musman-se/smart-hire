import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { NEXT_STAGES, type Application, type Candidate } from "../api/types";
import {
  Empty,
  ErrorNotice,
  StagePill,
  StatusPill,
  Tags,
  formatDate,
} from "../components/ui";
import {
  useAdvanceStage,
  useApplyToJob,
  useCandidates,
  useJob,
  useJobApplications,
  useJobTransition,
  useWithdrawApplication,
} from "../hooks/queries";

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

  // A long candidate list would need a search-as-you-type picker; at this scale a
  // single page of 100 is honest and simple.
  const { data: candidates } = useCandidates({ limit: 100, offset: 0 });
  const apply = useApplyToJob(jobId);

  const selected = candidates?.items.find((c) => c.id === candidateId);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!candidateId) return;

    apply.mutate(
      { candidate_id: candidateId, cover_letter: coverLetter || null },
      {
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
          It starts in the <code>applied</code> stage.
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

function ApplicationRow({ application }: { application: Application }) {
  const advance = useAdvanceStage();
  const withdraw = useWithdrawApplication();
  const nextStages = NEXT_STAGES[application.stage];

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
        <td className="muted">{application.match_score ?? "—"}</td>
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
            {nextStages.length === 0 && <span className="muted">final</span>}
            <button
              type="button"
              className="small ghost"
              onClick={() => withdraw.mutate(application.id)}
            >
              Withdraw
            </button>
          </div>
        </td>
      </tr>
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
          {job.status === "draft" && (
            <button type="button" className="primary" onClick={() => transition.mutate("publish")}>
              Publish
            </button>
          )}
          {job.status === "published" && (
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
                      <th>Score</th>
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
            <dd>{job.min_experience_years} years</dd>

            <dt>Cap</dt>
            <dd>{job.max_applications ?? "Unlimited"}</dd>

            <dt>Published</dt>
            <dd>{formatDate(job.published_at)}</dd>

            <dt>Created</dt>
            <dd>{formatDate(job.created_at)}</dd>

            <dt>Skills</dt>
            <dd>
              <Tags items={job.required_skills ?? []} />
            </dd>
          </dl>

          <h3 style={{ margin: "1.2rem 0 0.4rem" }}>Description</h3>
          <p className="muted" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
            {job.description}
          </p>
        </div>
      </div>
    </>
  );
}
