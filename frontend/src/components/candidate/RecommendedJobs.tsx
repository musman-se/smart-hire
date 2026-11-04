import { Link } from "react-router-dom";

import type { Candidate } from "../../api/types";
import { OPEN_JOBS_LIMIT, useOpenJobs } from "../../hooks/useCandidateExtras";
import {
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  ErrorNotice,
  Icon,
  Skeleton,
  SkeletonText,
  Tags,
  formatPercent,
  formatRelative,
} from "../ui";
import { profileFieldHref } from "../profile/completeness";
import { JobMeta } from "./JobMeta";
import { recommendJobs, type Recommendation } from "./recommend";

interface RecommendedJobsProps {
  candidate: Candidate;
  /** Jobs already applied to, which are never recommended again. */
  appliedJobIds: ReadonlySet<string>;
}

function fitTone(recommendation: Recommendation): "high" | "mid" | "open" {
  const { matched, missing, ratio } = recommendation.match;
  if (matched.length + missing.length === 0) return "open";
  return ratio >= 0.75 ? "high" : "mid";
}

function RecommendationItem({ recommendation, skills }: { recommendation: Recommendation; skills: readonly string[] }) {
  const { job, match, reasons } = recommendation;
  const tone = fitTone(recommendation);
  return (
    <li className="candidate-rec">
      <div className="candidate-rec-fit" data-fit={tone} aria-hidden="true">
        {tone === "open" ? <Icon name="sparkles" size={16} /> : formatPercent(match.ratio)}
      </div>
      <div className="candidate-rec-body">
        <div className="candidate-rec-head">
          <Link to={`/jobs/${job.id}`} className="candidate-rec-title">
            {job.title}
          </Link>
          {job.published_at && (
            <span className="candidate-rec-posted">Posted {formatRelative(job.published_at)}</span>
          )}
        </div>
        <JobMeta job={job} />
        <ul className="candidate-rec-reasons" aria-label="Why it fits">
          {reasons.map((reason) => (
            <li key={reason}>
              <Icon name="check" size={12} strokeWidth={3} />
              {reason}
            </li>
          ))}
        </ul>
        {match.matched.length + match.missing.length > 0 && (
          <Tags items={job.required_skills ?? []} highlight={skills} max={5} />
        )}
      </div>
      <ButtonLink
        to={`/jobs/${job.id}`}
        size="sm"
        variant="secondary"
        rightIcon="arrow-right"
        className="candidate-rec-cta"
        aria-label={`View ${job.title}`}
      >
        View
      </ButtonLink>
    </li>
  );
}

/**
 * Open roles the candidate is eligible for, best fit first. The ranking happens here,
 * over the newest page of published jobs — the API has no "match me" endpoint — and
 * the card says so rather than implying it searched everything.
 */
export function RecommendedJobs({ candidate, appliedJobIds }: RecommendedJobsProps) {
  const jobs = useOpenJobs();
  const skills = candidate.skills ?? [];
  const recommendations = jobs.data ? recommendJobs(candidate, jobs.data.items, appliedJobIds) : [];

  let body;
  if (jobs.isLoading) {
    body = (
      <ul className="candidate-rec-list" aria-busy="true">
        {[0, 1, 2].map((key) => (
          <li key={key} className="candidate-rec">
            <Skeleton width="2.75rem" height="2.75rem" circle />
            <div className="candidate-rec-body">
              <SkeletonText lines={2} />
            </div>
          </li>
        ))}
      </ul>
    );
  } else if (jobs.error) {
    body = <ErrorNotice error={jobs.error} />;
  } else if (recommendations.length > 0) {
    body = (
      <ul className="candidate-rec-list">
        {recommendations.map((recommendation) => (
          <RecommendationItem key={recommendation.job.id} recommendation={recommendation} skills={skills} />
        ))}
      </ul>
    );
  } else if (skills.length === 0) {
    body = (
      <EmptyState
        compact
        icon="target"
        title="Add your skills to get matched"
        description="Most roles list the skills they need. Tell us yours and the best fits show up here."
        action={
          <ButtonLink to={profileFieldHref("skills")} variant="primary" size="sm" leftIcon="plus">
            Add skills
          </ButtonLink>
        }
      />
    );
  } else {
    body = (
      <EmptyState
        compact
        icon="search"
        title="No new matches right now"
        description="None of the newest open roles fit your skills and experience yet. New roles are posted all the time."
        action={
          <ButtonLink to="/jobs" size="sm" rightIcon="arrow-right">
            Browse all jobs
          </ButtonLink>
        }
      />
    );
  }

  return (
    <Card padding="none" className="candidate-card">
      <CardHeader
        title="Recommended for you"
        icon="sparkles"
        description={`Roles you're eligible for, ranked by how well your skills fit. From the ${OPEN_JOBS_LIMIT} newest openings.`}
        actions={
          recommendations.length > 0 && (
            <ButtonLink to="/jobs" variant="ghost" size="sm" rightIcon="arrow-right">
              All jobs
            </ButtonLink>
          )
        }
      />
      <div className="candidate-card-body">{body}</div>
    </Card>
  );
}
