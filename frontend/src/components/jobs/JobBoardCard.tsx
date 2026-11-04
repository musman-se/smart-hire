import { useId } from "react";
import { Link } from "react-router-dom";

import { TERMINAL_STAGES } from "../../api/types";
import { STAGE_COPY } from "../candidate/stageCopy";
import { Badge, Icon, ScoreRing, Tags, cx, formatDateTime, formatRelative, humanize } from "../ui";
import { postedAt, type BoardEntry } from "./jobBoard";

export type BoardLayout = "grid" | "list";

interface JobBoardCardProps {
  entry: BoardEntry;
  layout: BoardLayout;
  /** False when the candidate has listed no skills: a 0% match would then say nothing
   * about the role, only about the profile. */
  profileHasSkills: boolean;
  /** The server refuses new applications while the candidate is at the active cap, so
   * an eligible role is not yet one they can apply to. */
  atCap: boolean;
}

/**
 * One opening on the candidate's job board: what the role is, how well they fit it,
 * and whether they have already applied. The title link stretches over the card, so
 * the whole card opens the job while staying a single Tab stop.
 */
export function JobBoardCard({ entry, layout, profileHasSkills, atCap }: JobBoardCardProps) {
  const { job, fit, application } = entry;
  const titleId = useId();
  const posted = postedAt(job);
  const skills = job.required_skills ?? [];

  return (
    <article className={cx("jobs-card", `jobs-card-${layout}`)} aria-labelledby={titleId}>
      <div className="jobs-card-body">
        <div className="jobs-card-head">
          <span className="jobs-card-icon" aria-hidden="true">
            <Icon name="briefcase" size={18} />
          </span>
          <div className="jobs-card-heading">
            <h2 className="jobs-card-title" id={titleId}>
              <Link to={`/jobs/${job.id}`} className="jobs-card-link">
                {job.title}
              </Link>
            </h2>
            {job.department && <p className="jobs-card-department">{job.department}</p>}
          </div>
        </div>

        <ul className="jobs-card-facts" aria-label="Role details">
          <li>
            <Badge size="sm" tone="neutral">
              {humanize(job.employment_type)}
            </Badge>
          </li>
          <li className="meta-item">
            <Icon name="map-pin" size={14} />
            {job.location || "Location not specified"}
          </li>
          <li className="meta-item">
            <Icon name="award" size={14} />
            {job.min_experience_years > 0
              ? `${job.min_experience_years}+ years`
              : "No minimum experience"}
          </li>
          <li className="meta-item">
            <Icon name="clock" size={14} />
            <time dateTime={posted} title={formatDateTime(posted)}>
              Posted {formatRelative(posted)}
            </time>
          </li>
        </ul>

        {skills.length > 0 && (
          <div className="jobs-card-skills">
            <span className="sr-only">Required skills{fit ? ", the ones you have marked" : ""}:</span>
            <Tags items={skills} highlight={fit?.match.matched} max={layout === "list" ? 8 : 5} />
          </div>
        )}
      </div>

      <div className="jobs-card-aside">
        {fit && <SkillMatch entry={entry} profileHasSkills={profileHasSkills} />}
        <div className="jobs-card-status">
          {application ? (
            <Badge
              tone={TERMINAL_STAGES.has(application.stage) ? "neutral" : "accent"}
              icon={STAGE_COPY[application.stage].icon}
            >
              {/* The candidate's words for the stage, never the recruiter's. */}
              {application.stage === "applied"
                ? "Applied"
                : `Applied · ${STAGE_COPY[application.stage].headline}`}
            </Badge>
          ) : fit?.eligible ? (
            atCap ? (
              <Badge tone="neutral" icon="info">
                Eligible · at your application limit
              </Badge>
            ) : (
              <Badge tone="success" icon="check">
                You can apply
              </Badge>
            )
          ) : fit ? (
            <Badge tone="warning" icon="alert-triangle">
              Not eligible yet
            </Badge>
          ) : null}
        </div>
        {!application && fit && !fit.eligible && (
          <ul className="jobs-card-reasons">
            {fit.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

function SkillMatch({
  entry,
  profileHasSkills,
}: {
  entry: BoardEntry;
  profileHasSkills: boolean;
}) {
  const required = entry.job.required_skills?.length ?? 0;
  const match = entry.fit?.match;
  if (!match) return null;

  if (required === 0) {
    return (
      <p className="jobs-match jobs-match-open">
        <Icon name="sparkles" size={14} />
        Open to any skill set
      </p>
    );
  }
  if (!profileHasSkills) {
    return (
      <p className="jobs-match jobs-match-open">
        <Icon name="info" size={14} />
        Add skills to see your match
      </p>
    );
  }

  const percent = Math.round(match.ratio * 100);
  return (
    <div className="jobs-match">
      <span aria-hidden="true">
        <ScoreRing score={percent} size={36} strokeWidth={4} hideLabel />
      </span>
      <p className="jobs-match-text">
        <strong className="tabular">{percent}% skill match</strong>
        <span className="jobs-match-detail">
          {match.matched.length} of {required} required skills
        </span>
      </p>
    </div>
  );
}
