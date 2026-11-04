import { useMemo } from "react";
import { useParams } from "react-router-dom";

import { ApiError } from "../api/client";
import { MAX_ACTIVE_APPLICATIONS, type Candidate } from "../api/types";
import { summarizeApplications } from "../components/applications/stages";
import { CandidateApplicationItem } from "../components/candidates/CandidateApplicationItem";
import {
  Avatar,
  ButtonLink,
  Card,
  CardHeader,
  CopyButton,
  EmptyState,
  ErrorNotice,
  Icon,
  KpiCard,
  PageHeader,
  ScoreRing,
  Skeleton,
  SkeletonText,
  StagePill,
  Tags,
  buttonClassName,
  formatDate,
  formatRelative,
  formatYears,
  pluralize,
  scoreBand,
  type ScoreBand,
} from "../components/ui";
import { useCandidate, useCandidateApplications, useJobsByIds } from "../hooks/queries";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useNow } from "../hooks/useNow";

const SCORE_HINT = {
  high: "Strong match",
  mid: "Partial match",
  low: "Weak match",
  pending: "Not scored yet",
} satisfies Record<ScoreBand, string>;

/**
 * A recruiter's view of one candidate. The router keeps candidates out: their own
 * record is their applications page.
 */
export function CandidateDetailPage() {
  const { candidateId = "" } = useParams();
  const { data: candidate, error, isLoading } = useCandidate(candidateId);
  useDocumentTitle(candidate?.full_name ?? "Candidate");

  if (isLoading) return <ProfileSkeleton />;
  if (!candidate) {
    const notFound = error instanceof ApiError && (error.status === 404 || error.status === 422);
    return (
      <div className="stack">
        <PageHeader title="Candidate" breadcrumbs={[{ label: "Candidates", to: "/candidates" }]} />
        {notFound ? (
          <Card>
            <EmptyState
              icon="user-x"
              title="This candidate does not exist"
              description="The profile may have been removed, or the link is incomplete."
              action={
                <ButtonLink to="/candidates" leftIcon="arrow-left">
                  All candidates
                </ButtonLink>
              }
            />
          </Card>
        ) : (
          <ErrorNotice error={error} />
        )}
      </div>
    );
  }
  return <Profile candidate={candidate} />;
}

function Profile({ candidate }: { candidate: Candidate }) {
  const applications = useCandidateApplications(candidate.id);
  const items = useMemo(() => applications.data?.items ?? [], [applications.data]);
  const jobs = useJobsByIds(items.map((application) => application.job_id));
  const summary = useMemo(() => summarizeApplications(items), [items]);
  // A failed read must not pass for "no applications": every figure shows a dash instead.
  const failed = applications.isError;
  const page = applications.data;
  const now = useNow();
  const skills = candidate.skills ?? [];
  const firstName = candidate.full_name.split(/\s+/)[0] || candidate.full_name;

  return (
    <div className="stack candidates-profile">
      <PageHeader
        breadcrumbs={[{ label: "Candidates", to: "/candidates" }, { label: candidate.full_name }]}
        leading={<Avatar name={candidate.full_name} size="xl" />}
        title={candidate.full_name}
        description={candidate.headline || "No headline yet"}
        meta={
          <>
            <span className="meta-item">
              <Icon name="briefcase" size={14} />
              {formatYears(candidate.years_experience)} experience
            </span>
            <span className="meta-item">
              <Icon name="calendar" size={14} />
              Joined {formatDate(candidate.created_at)}
            </span>
          </>
        }
        actions={
          <>
            <a href={`mailto:${candidate.email}`} className={buttonClassName()}>
              <Icon name="mail" />
              Email
            </a>
            {candidate.resume_url && (
              <a
                href={candidate.resume_url}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClassName({ variant: "primary" })}
              >
                <Icon name="file-text" />
                Resume
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            )}
          </>
        }
      />

      <div className="kpi-grid">
        <KpiCard
          label="Applications"
          icon="file-text"
          loading={applications.isLoading}
          value={failed ? "—" : (page?.total ?? 0)}
          hint={
            failed
              ? "Could not load"
              : summary.total === 0
                ? "None yet"
                : `Last applied ${formatRelative(items[0]?.created_at)}`
          }
        />
        <KpiCard
          label="Active"
          icon="activity"
          loading={applications.isLoading}
          value={failed ? "—" : summary.active}
          hint={failed ? "Could not load" : `of ${MAX_ACTIVE_APPLICATIONS} allowed at once`}
        />
        <KpiCard
          label="Best match"
          icon="target"
          loading={applications.isLoading}
          value={
            <span className="candidates-kpi-score">
              <ScoreRing score={summary.bestScore} size={32} strokeWidth={3} hideLabel />
              {summary.bestScore ?? "—"}
            </span>
          }
          hint={failed ? "Could not load" : SCORE_HINT[scoreBand(summary.bestScore)]}
        />
        <KpiCard
          label="Furthest stage"
          icon="trending-up"
          loading={applications.isLoading}
          value={summary.furthest ? <StagePill stage={summary.furthest} /> : "—"}
          hint={failed ? "Could not load" : "Across all applications"}
        />
      </div>

      <div className="grid-sidebar">
        <Card padding="none">
          <CardHeader
            title="Applications"
            icon="file-text"
            description={
              // Worded from the page the server returned, so it always matches what was read.
              page && page.total > page.items.length
                ? `The latest ${page.items.length} of ${page.total}, newest first`
                : "Newest first. Expand one for the cover letter and its history."
            }
          />
          {applications.isLoading ? (
            <div className="candidates-app-list-loading">
              <SkeletonText lines={3} />
              <SkeletonText lines={3} />
            </div>
          ) : failed ? (
            <ErrorNotice error={applications.error} />
          ) : items.length === 0 ? (
            // Recruiters cannot apply on a candidate's behalf; reaching out is what they can do.
            <EmptyState
              icon="file-text"
              title={`${firstName} has not applied yet`}
              description="Applications show up here with their score, stage and history."
              action={
                <a href={`mailto:${candidate.email}`} className={buttonClassName()}>
                  <Icon name="mail" />
                  Email {firstName}
                </a>
              }
            />
          ) : (
            <ul className="candidates-app-list" aria-label={`${candidate.full_name}'s applications`}>
              {items.map((application) => (
                <CandidateApplicationItem
                  key={application.id}
                  application={application}
                  job={jobs.byId.get(application.job_id)}
                  jobLoading={jobs.isLoading}
                  candidateName={candidate.full_name}
                  candidateSkills={skills}
                  now={now}
                />
              ))}
            </ul>
          )}
        </Card>

        <aside className="stack" aria-label="Profile">
          <Card>
            <CardHeader title="Contact" icon="user" as="h3" />
            <dl className="detail-list candidates-contact">
              <dt>Email</dt>
              <dd>
                <a href={`mailto:${candidate.email}`} className="truncate">
                  {candidate.email}
                </a>
                <CopyButton value={candidate.email} label="email" />
              </dd>
              <dt>Phone</dt>
              <dd>
                {candidate.phone ? (
                  <>
                    <a href={`tel:${candidate.phone}`}>{candidate.phone}</a>
                    <CopyButton value={candidate.phone} label="phone number" />
                  </>
                ) : (
                  <span className="subtle">Not provided</span>
                )}
              </dd>
              <dt>Resume</dt>
              <dd>
                {candidate.resume_url ? (
                  <a href={candidate.resume_url} target="_blank" rel="noopener noreferrer" className="truncate">
                    Open resume
                    <Icon name="external-link" size={12} />
                  </a>
                ) : (
                  <span className="subtle">Not provided</span>
                )}
              </dd>
            </dl>
          </Card>

          <Card>
            <CardHeader
              title="Skills"
              icon="award"
              as="h3"
              actions={skills.length > 0 && <span className="subtle text-sm">{skills.length}</span>}
            />
            {skills.length > 0 ? (
              <Tags items={skills} />
            ) : (
              <p className="subtle text-sm">{firstName} has not listed any skills.</p>
            )}
          </Card>

          <Card>
            <CardHeader title="Profile" icon="info" as="h3" />
            <dl className="detail-list candidates-contact">
              <dt>Experience</dt>
              <dd>{formatYears(candidate.years_experience)}</dd>
              <dt>Joined</dt>
              <dd title={formatDate(candidate.created_at)}>{formatRelative(candidate.created_at)}</dd>
              <dt>Updated</dt>
              <dd title={formatDate(candidate.updated_at)}>{formatRelative(candidate.updated_at)}</dd>
              <dt>Applications</dt>
              <dd>{failed ? "—" : pluralize(page?.total ?? 0, "application")}</dd>
              <dt>Profile ID</dt>
              <dd>
                <span className="mono truncate text-xs">{candidate.id}</span>
                <CopyButton value={candidate.id} label="profile ID" />
              </dd>
            </dl>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="stack" aria-busy="true" aria-label="Loading candidate">
      <div className="row">
        <Skeleton circle width="3.5rem" height="3.5rem" />
        <div className="stack-sm candidates-skeleton-head">
          <Skeleton width="14rem" height="1.5rem" />
          <Skeleton width="20rem" />
        </div>
      </div>
      <div className="kpi-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <KpiCard key={index} label="" value="" loading />
        ))}
      </div>
      <div className="grid-sidebar">
        <Card>
          <SkeletonText lines={6} />
        </Card>
        <Card>
          <SkeletonText lines={4} />
        </Card>
      </div>
    </div>
  );
}
