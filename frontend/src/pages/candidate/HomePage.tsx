import { useMemo } from "react";

import { useUser } from "../../auth/AuthProvider";
import { ActivityFeed, FEED_APPLICATIONS } from "../../components/candidate/ActivityFeed";
import { ApplicationSummary } from "../../components/candidate/ApplicationSummary";
import { GettingStarted } from "../../components/candidate/GettingStarted";
import { ProfileChecklist } from "../../components/candidate/ProfileChecklist";
import { RecommendedJobs } from "../../components/candidate/RecommendedJobs";
import { sortApplications } from "../../components/candidate/applications";
import { firstName } from "../../components/candidate/greeting";
import { profileCompleteness } from "../../components/profile/completeness";
import {
  ButtonLink,
  Card,
  ErrorNotice,
  PageHeader,
  Skeleton,
  SkeletonText,
  greeting,
} from "../../components/ui";
import { useCandidate } from "../../hooks/queries";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useMyApplications } from "../../hooks/useCandidateExtras";

function HomeSkeleton() {
  return (
    <div className="grid-sidebar" aria-busy="true">
      <div className="stack">
        <Card>
          <SkeletonText lines={4} />
        </Card>
        <Card>
          <SkeletonText lines={5} />
        </Card>
      </div>
      <Card>
        <Skeleton width="60%" />
        <SkeletonText lines={5} />
      </Card>
    </div>
  );
}

/**
 * The candidate's landing page (/home): where their search stands, what to do next,
 * and roles worth a look. A brand-new candidate gets a three-step start instead of
 * a wall of zeros.
 */
export function CandidateHomePage() {
  const user = useUser();
  const candidate = useCandidate(user.id);
  const applications = useMyApplications();
  useDocumentTitle("Home");

  const items = useMemo(() => applications.data?.items ?? [], [applications.data]);
  const appliedJobIds = useMemo(() => new Set(items.map((a) => a.job_id)), [items]);
  const recent = useMemo(() => sortApplications(items, "updated").slice(0, FEED_APPLICATIONS), [items]);

  const name = firstName(candidate.data?.full_name);
  const title = `${greeting(new Date().getHours())}${name ? `, ${name}` : ""}`;
  const isNew = applications.isSuccess && applications.data.total === 0;

  return (
    <>
      <PageHeader
        title={title}
        description={
          isNew
            ? "Let's get your job search started."
            : "Here's where your job search stands today."
        }
        actions={
          <ButtonLink to="/jobs" variant="primary" leftIcon="search">
            Browse jobs
          </ButtonLink>
        }
      />

      <ErrorNotice error={candidate.error ?? applications.error} />

      {candidate.isLoading ? (
        <HomeSkeleton />
      ) : candidate.data ? (
        <>
          {isNew ? (
            <GettingStarted completeness={profileCompleteness(candidate.data)} />
          ) : applications.isError ? null : (
            // On error the notice above explains; "0 of 10" here would be a guess.
            <ApplicationSummary applications={items} loading={applications.isLoading} />
          )}

          <div className="grid-sidebar candidate-home-grid">
            <div className="stack">
              {/* Waits for the applications, or it would recommend roles already applied to. */}
              {applications.isLoading ? (
                <Card>
                  <SkeletonText lines={5} />
                </Card>
              ) : applications.isSuccess ? (
                <RecommendedJobs candidate={candidate.data} appliedJobIds={appliedJobIds} />
              ) : null}
              {!isNew && applications.isSuccess && <ActivityFeed applications={recent} />}
            </div>

            <aside className="stack" aria-label="Your profile">
              <ProfileChecklist candidate={candidate.data} />
            </aside>
          </div>
        </>
      ) : null}
    </>
  );
}
