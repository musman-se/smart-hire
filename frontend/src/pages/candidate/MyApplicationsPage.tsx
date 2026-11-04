import { useMemo } from "react";

import type { Application } from "../../api/types";
import { useUser } from "../../auth/AuthProvider";
import { ApplicationCard } from "../../components/candidate/ApplicationCard";
import { ApplicationDrawer } from "../../components/candidate/ApplicationDrawer";
import { CapMeter } from "../../components/candidate/CapMeter";
import { jobTitleText } from "../../components/candidate/JobTitle";
import {
  sortApplications,
  splitApplications,
  type ApplicationSort,
} from "../../components/candidate/applications";
import { useWithdraw } from "../../components/candidate/useWithdraw";
import {
  ButtonLink,
  Card,
  EmptyState,
  ErrorNotice,
  Notice,
  PageHeader,
  Pagination,
  SegmentedControl,
  Skeleton,
  SkeletonText,
  Tabs,
  pluralize,
  stoppedAt,
} from "../../components/ui";
import { useApplication, useCandidate, useJobsByIds } from "../../hooks/queries";
import { MY_APPLICATIONS_LIMIT, useHistories, useMyApplications } from "../../hooks/useCandidateExtras";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { urlParam, useUrlState } from "../../hooks/useUrlState";

const TABS = ["active", "closed"] as const;
const SORTS = ["updated", "applied"] as const satisfies readonly ApplicationSort[];

/** Tab, order, page and the open application all live in the URL, so a link from the
 * home feed (`?app=…`) opens straight onto that application. */
const VIEW = {
  tab: urlParam.oneOf(TABS, "active"),
  sort: urlParam.oneOf(SORTS, "updated"),
  offset: urlParam.number(0, { min: 0 }),
  app: urlParam.string(),
};

const PAGE_SIZE = 20;

function ListSkeleton() {
  return (
    <ul className="candidate-app-list" aria-busy="true">
      {[0, 1, 2].map((key) => (
        <li key={key} className="candidate-app">
          <Skeleton width="40%" height="1.25rem" />
          <SkeletonText lines={2} />
        </li>
      ))}
    </ul>
  );
}

/** A candidate's own applications (/applications). Recruiters get ApplicationsPage on the same route. */
export function MyApplicationsPage() {
  const user = useUser();
  useDocumentTitle("My applications");
  const [view, setView] = useUrlState(VIEW);
  const compact = useMediaQuery("(max-width: 600px)");
  const { withdraw, pendingId } = useWithdraw();

  const applications = useMyApplications();
  const candidate = useCandidate(user.id);

  const all = useMemo(() => applications.data?.items ?? [], [applications.data]);
  const { active, closed } = useMemo(() => splitApplications(all), [all]);
  const list = useMemo(
    () => sortApplications(view.tab === "active" ? active : closed, view.sort),
    [view.tab, view.sort, active, closed],
  );
  // A withdrawal or an old link can leave the offset past the end, or off a page
  // boundary; snap it to the start of the page it falls in, or of the last page.
  const lastIndex = Math.max(0, list.length - 1);
  const offset = Math.floor(Math.min(view.offset, lastIndex) / PAGE_SIZE) * PAGE_SIZE;
  const page = useMemo(() => list.slice(offset, offset + PAGE_SIZE), [list, offset]);

  // The open application is usually in the list; a deep link to an older one (beyond
  // the newest 100) is fetched on its own.
  const listed = all.find((application) => application.id === view.app);
  const fetched = useApplication(applications.isSuccess && view.app && !listed ? view.app : "");
  const selected = listed ?? fetched.data;

  const jobs = useJobsByIds([...page.map((a) => a.job_id), ...(selected ? [selected.job_id] : [])]);
  // Only closed applications need their history on the card, to show where they stopped.
  const historyIds = useMemo(
    () => (view.tab === "closed" ? page.map((a) => a.id) : []),
    [view.tab, page],
  );
  const histories = useHistories(historyIds);

  const onWithdraw = (application: Application) =>
    withdraw(application.id, jobTitleText(jobs.byId.get(application.job_id)));

  const total = applications.data?.total ?? 0;
  const truncated = total > all.length;

  let body;
  if (applications.isLoading) {
    body = <ListSkeleton />;
  } else if (applications.error) {
    body = <ErrorNotice error={applications.error} />;
  } else if (all.length === 0) {
    body = (
      <Card>
        <EmptyState
          icon="send"
          title="You haven't applied anywhere yet"
          description="Find a role that fits your skills. Every application you send is tracked here, step by step."
          action={
            <ButtonLink to="/jobs" variant="primary" leftIcon="search">
              Browse jobs
            </ButtonLink>
          }
        />
      </Card>
    );
  } else if (list.length === 0) {
    body = (
      <Card>
        {view.tab === "active" ? (
          <EmptyState
            icon="inbox"
            title="No active applications"
            description={`Your ${pluralize(closed.length, "closed application")} are under Closed. Ready for the next one?`}
            action={
              <ButtonLink to="/jobs" variant="primary" leftIcon="search">
                Find your next role
              </ButtonLink>
            }
          />
        ) : (
          <EmptyState
            icon="archive"
            title="Nothing closed yet"
            description="Applications that end in a hire, a rejection or a withdrawal move here."
          />
        )}
      </Card>
    );
  } else {
    body = (
      <>
        <ul className="candidate-app-list">
          {page.map((application) => (
            <ApplicationCard
              key={application.id}
              application={application}
              job={jobs.byId.get(application.job_id)}
              jobLoading={jobs.isLoading}
              stoppedAt={stoppedAt(histories.byId.get(application.id))}
              compact={compact}
              withdrawing={pendingId === application.id}
              onOpen={() => setView({ app: application.id })}
              onWithdraw={() => onWithdraw(application)}
            />
          ))}
        </ul>
        {list.length > PAGE_SIZE && (
          <Pagination
            total={list.length}
            limit={PAGE_SIZE}
            offset={offset}
            onChange={(next) => setView({ offset: next })}
            noun="applications"
          />
        )}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="My applications"
        description="Every role you've applied to, and where each one stands."
        actions={
          <ButtonLink to="/jobs" variant="primary" leftIcon="search">
            Find jobs
          </ButtonLink>
        }
      />

      {applications.data && all.length > 0 && (
        <Card className="candidate-apps-summary">
          <CapMeter active={active.length} />
        </Card>
      )}

      {truncated && (
        <Notice tone="info" title={`Showing your ${MY_APPLICATIONS_LIMIT} most recent applications`}>
          You have {total} in all. Older ones are still on file with the hiring teams.
        </Notice>
      )}

      {all.length > 0 && (
        <div className="candidate-apps-toolbar">
          <Tabs
            aria-label="Application status"
            value={view.tab}
            onChange={(tab) => setView({ tab, offset: 0 })}
            items={[
              { value: "active", label: "Active", count: active.length },
              { value: "closed", label: "Closed", count: closed.length },
            ]}
          />
          <SegmentedControl
            aria-label="Order by"
            size="sm"
            value={view.sort}
            onChange={(sort) => setView({ sort, offset: 0 })}
            options={[
              { value: "updated", label: "Last update" },
              { value: "applied", label: "Date applied" },
            ]}
          />
        </div>
      )}

      {body}

      <ApplicationDrawer
        application={selected}
        job={selected && jobs.byId.get(selected.job_id)}
        jobLoading={jobs.isLoading}
        skills={candidate.data?.skills}
        withdrawing={Boolean(selected) && pendingId === selected?.id}
        onClose={() => setView({ app: "" })}
        onWithdraw={() => selected && onWithdraw(selected)}
      />
    </>
  );
}
