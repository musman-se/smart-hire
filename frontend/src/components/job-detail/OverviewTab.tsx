import { PIPELINE_STAGES, type Application, type ApplicationStage, type Job } from "../../api/types";
import {
  Card,
  CardHeader,
  ProgressBar,
  ScoreRing,
  SkeletonText,
  StatusPill,
  Tags,
  formatDate,
  formatNumber,
  formatRelative,
  formatYears,
  humanize,
  pluralize,
} from "../ui";
import { countByStage } from "../pipeline/model";

export interface OverviewTabProps {
  job: Job;
  /** The job's latest 100 applications; undefined while loading. */
  applications: Application[] | undefined;
  /** Every application the job has received — the figure its cap is measured against. */
  total: number | undefined;
  /** Opens the Applicants tab, filtered to one stage. */
  onShowStage: (stage: ApplicationStage) => void;
}

/** Bars fill relative to the busiest stage, so a small funnel is still readable. */
function funnelWidth(count: number, busiest: number): string {
  return busiest === 0 ? "0%" : `${Math.max(4, (count / busiest) * 100)}%`;
}

/** Whether the job takes applications now, and if not, why. Only a live job does. */
function intakeNote(job: Job, total: number): string {
  if (job.status === "closed") return "Closed — the job no longer takes applications. Reopen and publish it to take more.";
  if (job.status !== "published") return "Not taking applications yet: candidates can apply once the job is published.";
  const cap = job.max_applications;
  if (!cap) return "No cap: the job takes applications until you close it.";
  return total >= cap
    ? "Full — new applications are refused. Withdrawn and rejected ones still count."
    : `${formatNumber(total)} of ${pluralize(cap, "application")} — the cap counts every application, whatever its stage.`;
}

/** The job at a glance: the posting itself, and how intake is going. */
export function OverviewTab({ job, applications, total, onShowStage }: OverviewTabProps) {
  return (
    <div className="grid-sidebar job-detail-overview">
      <div className="stack">
        <Card>
          <CardHeader title="About the role" icon="file-text" />
          <p className="prewrap job-detail-description">{job.description}</p>
        </Card>
        <Card>
          <CardHeader
            title="What applicants need"
            icon="check-circle"
            description="Applicants who miss either rule are turned away at the door, before you see them."
          />
          <dl className="detail-list">
            <dt>Required skills</dt>
            <dd>
              {(job.required_skills ?? []).length > 0 ? (
                <>
                  <Tags items={job.required_skills ?? []} />
                  <p className="text-xs subtle">At least one of these is needed to apply.</p>
                </>
              ) : (
                <span className="muted">None — anyone may apply on skills.</span>
              )}
            </dd>
            <dt>Experience</dt>
            <dd>{job.min_experience_years > 0 ? `${formatYears(job.min_experience_years)} or more` : "No minimum"}</dd>
          </dl>
        </Card>
      </div>

      <div className="stack">
        <IntakeCard job={job} applications={applications} total={total} onShowStage={onShowStage} />
        <Card>
          <CardHeader title="Details" icon="info" />
          <dl className="detail-list">
            <dt>Status</dt>
            <dd>
              <StatusPill status={job.status} />
            </dd>
            <dt>Type</dt>
            <dd>{humanize(job.employment_type)}</dd>
            <dt>Department</dt>
            <dd>{job.department || <span className="subtle">—</span>}</dd>
            <dt>Location</dt>
            <dd>{job.location || <span className="subtle">—</span>}</dd>
            <dt>Created</dt>
            <dd>{formatDate(job.created_at)}</dd>
            <dt>Published</dt>
            <dd>{job.published_at ? formatDate(job.published_at) : <span className="subtle">Not yet</span>}</dd>
            <dt>Last edited</dt>
            <dd title={formatDate(job.updated_at)}>{formatRelative(job.updated_at)}</dd>
          </dl>
        </Card>
      </div>
    </div>
  );
}

function IntakeCard({ job, applications, total, onShowStage }: OverviewTabProps) {
  if (!applications || total === undefined) {
    return (
      <Card>
        <CardHeader title="Applications" icon="inbox" />
        <SkeletonText lines={4} />
      </Card>
    );
  }

  const counts = countByStage(applications);
  // The way out of the pipeline is shown only when someone took it.
  const rows: ApplicationStage[] = [
    ...PIPELINE_STAGES,
    ...(["rejected", "withdrawn"] as const).filter((stage) => counts[stage] > 0),
  ];
  const busiest = Math.max(...rows.map((stage) => counts[stage]));
  const scored = applications.filter((a) => typeof a.match_score === "number");
  const average = scored.length
    ? scored.reduce((sum, a) => sum + (a.match_score ?? 0), 0) / scored.length
    : null;
  const cap = job.max_applications;
  const usage = cap ? total / cap : 0;

  return (
    <Card>
      <CardHeader title="Applications" icon="inbox" />
      <div className="job-detail-intake">
        <div>
          <p className="job-detail-intake-total tabular">{formatNumber(total)}</p>
          <p className="text-sm muted">{total === 1 ? "application received" : "applications received"}</p>
        </div>
        {average !== null && (
          <div className="row" title="Average match score across scored applications">
            <ScoreRing score={average} size={40} />
            <span className="text-sm muted">avg. match</span>
          </div>
        )}
      </div>

      {cap ? (
        <div className="stack-sm">
          <ProgressBar
            label="Application cap used"
            value={total}
            max={cap}
            valueText={`${total} of ${cap}`}
            tone={usage >= 1 ? "danger" : usage >= 0.8 ? "warning" : "accent"}
          />
          <p className="text-xs subtle">{intakeNote(job, total)}</p>
        </div>
      ) : (
        <p className="text-xs subtle">{intakeNote(job, total)}</p>
      )}

      {total > 0 && (
        <ul className="job-detail-funnel" aria-label="Applications by stage">
          {rows.map((stage) => (
            <li key={stage}>
              <button
                type="button"
                className="job-detail-funnel-row"
                data-stage={stage}
                onClick={() => onShowStage(stage)}
                aria-label={`${humanize(stage)}: ${counts[stage]}. Show these applicants`}
              >
                <span className="job-detail-funnel-label">{humanize(stage)}</span>
                <span className="job-detail-funnel-track" aria-hidden="true">
                  <span className="job-detail-funnel-bar" style={{ width: funnelWidth(counts[stage], busiest) }} />
                </span>
                <span className="tabular">{counts[stage]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {total > applications.length && (
        <p className="text-xs subtle">Stage breakdown covers the latest {applications.length}.</p>
      )}
    </Card>
  );
}
