import { Link, useParams } from "react-router-dom";

import { TERMINAL_STAGES, type Application } from "../api/types";
import { useUser } from "../auth/AuthProvider";
import { Empty, ErrorNotice, StagePill, Tags, formatDate } from "../components/ui";
import {
  useCandidate,
  useCandidateApplications,
  useWithdrawApplication,
} from "../hooks/queries";

/** Withdrawing is the candidate's own decision, so only they get the button. */
function WithdrawButton({ application }: { application: Application }) {
  const withdraw = useWithdrawApplication();
  if (TERMINAL_STAGES.has(application.stage)) return null;

  return (
    <>
      <button
        type="button"
        className="small ghost"
        disabled={withdraw.isPending}
        onClick={() => withdraw.mutate(application.id)}
      >
        Withdraw
      </button>
      <ErrorNotice error={withdraw.error} />
    </>
  );
}

/** A recruiter's view of any candidate, and a candidate's view of themselves — the
 * server answers 404 to a candidate asking for anyone else. */
export function CandidateDetailPage() {
  const { candidateId = "" } = useParams();
  const user = useUser();
  const isSelf = user.id === candidateId;
  const { data: candidate, isLoading, error } = useCandidate(candidateId);
  const { data: applications } = useCandidateApplications(candidateId);

  if (isLoading) return <Empty>Loading…</Empty>;
  if (error) return <ErrorNotice error={error} />;
  if (!candidate) return <Empty>Candidate not found.</Empty>;

  // Mirrors the backend's limit rule: terminal stages (hired, rejected, withdrawn) free
  // up a slot, so a rejected candidate is never locked out of applying elsewhere.
  const active = (applications?.items ?? []).filter((a) => !TERMINAL_STAGES.has(a.stage)).length;

  return (
    <>
      {user.role === "recruiter" && (
        <div className="breadcrumb">
          <Link to="/candidates">Candidates</Link> / {candidate.full_name}
        </div>
      )}

      <div className="page-head">
        <div>
          <h1>{candidate.full_name}</h1>
          <p>{candidate.headline ?? candidate.email}</p>
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head">
            <h2>Applications</h2>
            <span className="spacer" />
            <span className="muted">
              {active} active · {applications?.total ?? 0} total
            </span>
          </div>

          {!applications || applications.items.length === 0 ? (
            <Empty>
              {isSelf
                ? "You have not applied to anything yet. Browse Jobs to apply."
                : "This candidate has not applied to anything yet."}
            </Empty>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Stage</th>
                    <th>Applied</th>
                    {isSelf && <th />}
                  </tr>
                </thead>
                <tbody>
                  {applications.items.map((application) => (
                    <tr key={application.id}>
                      <td>
                        <Link to={`/jobs/${application.job_id}`} className="mono">
                          {application.job_id.slice(0, 8)}
                        </Link>
                      </td>
                      <td>
                        <StagePill stage={application.stage} />
                      </td>
                      <td className="muted">{formatDate(application.created_at)}</td>
                      {isSelf && (
                        <td className="actions">
                          <WithdrawButton application={application} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Profile</h2>
          </div>

          <dl className="detail-list">
            <dt>Email</dt>
            <dd className="mono">{candidate.email}</dd>

            <dt>Phone</dt>
            <dd>{candidate.phone ?? "—"}</dd>

            <dt>Experience</dt>
            <dd>{candidate.years_experience} years</dd>

            <dt>Resume</dt>
            <dd>
              {candidate.resume_url ? (
                <a href={candidate.resume_url} target="_blank" rel="noreferrer">
                  Open
                </a>
              ) : (
                "—"
              )}
            </dd>

            <dt>Registered</dt>
            <dd>{formatDate(candidate.created_at)}</dd>

            <dt>Skills</dt>
            <dd>
              <Tags items={candidate.skills ?? []} />
            </dd>
          </dl>
        </div>
      </div>
    </>
  );
}
