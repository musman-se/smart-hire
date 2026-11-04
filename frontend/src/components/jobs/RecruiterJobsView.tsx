import { useRef } from "react";
import { Link, useNavigate } from "react-router-dom";

import { JOB_STATUSES, type Job, type JobStatus } from "../../api/types";
import { useJobStatusCounts, useSuggestSkills } from "../../hooks/queries";
import { useClampOffset } from "../../hooks/useClampOffset";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useHotkeys } from "../../hooks/useHotkeys";
import { useLiveJobs } from "../../hooks/useJobsExtras";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { urlParam, useUrlState } from "../../hooks/useUrlState";
import {
  Button,
  ButtonLink,
  Card,
  DataTable,
  EmptyState,
  ErrorNotice,
  Kbd,
  PageHeader,
  Pagination,
  SearchInput,
  StatusPill,
  Tabs,
  TagInput,
  Tags,
  Tooltip,
  formatDateTime,
  formatRelative,
  humanize,
  type Column,
} from "../ui";
import { JobActionsMenu } from "./JobActionsMenu";
import { useDebouncedUrlText } from "./useDebouncedUrlText";

const FILTERS = {
  status: urlParam.oneOf(JOB_STATUSES),
  search: urlParam.string(),
  skill: urlParam.string(),
  offset: urlParam.number(0, { min: 0 }),
};

/**
 * Page size is a saved per-user preference rather than a URL param, so a recruiter's
 * chosen density follows them across visits, and a shared link opens at the reader's
 * own size.
 */
const PAGE_SIZES = [10, 20, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 20;

type StatusTab = JobStatus | "all";

const STATUS_EMPTY: Record<JobStatus, { title: string; description: string }> = {
  draft: {
    title: "No drafts",
    description: "Jobs start here when you create them, and stay until you publish them.",
  },
  processing: {
    title: "Nothing is being published",
    description: "Published jobs pass through here for a few seconds while their content is analysed.",
  },
  published: {
    title: "No live jobs",
    description: "Publish a draft to put it on the job board, where candidates can apply.",
  },
  publish_failed: {
    title: "No failed publishes",
    description: "When publishing cannot finish, the job lands here with the reason, ready to retry.",
  },
  closed: {
    title: "No closed jobs",
    description: "Close a job to stop new applications while keeping its pipeline and history.",
  },
};

const skillName = (skill: string) => skill.trim().toLowerCase();

const COLUMNS: readonly Column<Job>[] = [
  {
    key: "title",
    header: "Job",
    sortValue: (job) => job.title,
    cell: (job) => (
      <div className="jobs-title-cell">
        <Link to={`/jobs/${job.id}`} className="jobs-title-link">
          {job.title}
        </Link>
        <span className="jobs-title-meta">
          {[job.department, job.location].filter(Boolean).join(" · ") || "No department or location"}
        </span>
      </div>
    ),
  },
  {
    key: "type",
    header: "Type",
    sortValue: (job) => job.employment_type,
    cell: (job) => humanize(job.employment_type),
    className: "jobs-col-type",
  },
  {
    key: "skills",
    header: "Required skills",
    cell: (job) => <Tags items={job.required_skills ?? []} max={3} />,
    className: "jobs-col-skills",
  },
  {
    key: "status",
    header: "Status",
    sortValue: (job) => JOB_STATUSES.indexOf(job.status),
    cell: (job) => (
      <div className="jobs-status-cell">
        <StatusPill status={job.status} />
        {job.status === "publish_failed" && job.publish_error && (
          <span className="jobs-status-error" title={job.publish_error}>
            {job.publish_error}
          </span>
        )}
      </div>
    ),
  },
  {
    key: "created",
    header: "Created",
    sortValue: (job) => job.created_at,
    cell: (job) => (
      <time dateTime={job.created_at} title={formatDateTime(job.created_at)} className="subtle">
        {formatRelative(job.created_at)}
      </time>
    ),
    className: "jobs-col-created",
  },
  {
    key: "actions",
    header: <span className="sr-only">Actions</span>,
    cell: (job) => <JobActionsMenu job={job} />,
    align: "right",
    width: "3rem",
  },
];

/** The recruiter's view of /jobs: every job in every status, to find and manage. */
export function RecruiterJobsView() {
  useDocumentTitle("Jobs");
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);
  const suggestSkills = useSuggestSkills();

  const [filters, setFilters] = useUrlState(FILTERS, { resetOnChange: "offset" });
  const [search, setSearch] = useDebouncedUrlText(filters.search, (value) => setFilters({ search: value }));
  const [storedPageSize, setPageSize] = useLocalStorage<number>("smarthire.jobs.pageSize", DEFAULT_PAGE_SIZE);
  const pageSize = (PAGE_SIZES as readonly number[]).includes(storedPageSize)
    ? storedPageSize
    : DEFAULT_PAGE_SIZE;

  const counts = useJobStatusCounts();
  const { data, error, isLoading, isPlaceholderData, refetch } = useLiveJobs({
    status: filters.status,
    search: filters.search,
    skill: filters.skill,
    limit: pageSize,
    offset: filters.offset,
  });

  useClampOffset(data, filters.offset, pageSize, (offset) =>
    setFilters({ offset }, { history: "replace" }),
  );

  // "n" for a new job is global (GlobalShortcuts), so only search is bound here.
  useHotkeys([{ combo: "/", handler: () => searchRef.current?.focus() }]);

  const tab: StatusTab = filters.status || "all";
  const textFiltered = Boolean(filters.search || filters.skill);
  const clearFilters = () => setFilters({ search: "", skill: "" });

  const tabs = [
    { value: "all" as StatusTab, label: "All", count: counts.isLoading ? undefined : counts.total },
    ...JOB_STATUSES.map((status) => ({
      value: status as StatusTab,
      label: humanize(status),
      count: counts.counts[status],
    })),
  ];

  return (
    <>
      <PageHeader
        title="Jobs"
        description="Draft roles, publish them to the job board, and close them when they are filled."
        actions={
          <Tooltip content={<>Shortcut <Kbd>N</Kbd></>}>
            <ButtonLink to="/jobs/new" variant="primary" leftIcon="plus">
              New job
            </ButtonLink>
          </Tooltip>
        }
      />

      <Card className="jobs-panel">
        <Tabs
          className="jobs-tabs"
          items={tabs}
          value={tab}
          onChange={(next) => setFilters({ status: next === "all" ? "" : next })}
          aria-label="Job status"
        />

        <div className="jobs-toolbar" role="search" aria-label="Filter jobs">
          <div className="jobs-toolbar-row">
            <SearchInput
              ref={searchRef}
              className="jobs-toolbar-search"
              value={search}
              onValueChange={setSearch}
              placeholder="Search by title"
              aria-label="Search jobs by title"
              aria-keyshortcuts="/"
            />
            <TagInput
              className="jobs-skill-filter"
              value={filters.skill ? [filters.skill] : []}
              onChange={(skills) => setFilters({ skill: skills[0] ?? "" })}
              suggest={suggestSkills}
              normalize={skillName}
              maxTags={1}
              placeholder="Filter by skill"
              aria-label="Filter by skill"
            />
            {textFiltered && (
              <Button variant="ghost" size="sm" leftIcon="x" onClick={clearFilters}>
                Clear
              </Button>
            )}
            <span className="spacer" />
            {data && data.total > 1 && (
              <span className="jobs-toolbar-note subtle">Column sorting applies to this page</span>
            )}
          </div>
        </div>

        <ErrorNotice error={error} className="jobs-panel-notice" />

        <DataTable
          className={isPlaceholderData ? "is-stale" : undefined}
          caption="Jobs"
          columns={COLUMNS}
          rows={data?.items}
          getRowId={(job) => job.id}
          loading={isLoading}
          skeletonRows={pageSize > 10 ? 8 : 5}
          onRowClick={(job) => navigate(`/jobs/${job.id}`)}
          error={error}
          onRetry={() => void refetch()}
          empty={
            textFiltered ? (
              <EmptyState
                compact
                icon="search"
                title="No jobs match these filters"
                description={
                  filters.status
                    ? `Nothing in ${humanize(filters.status).toLowerCase()} matches. Try another status or clear the search.`
                    : "Check the spelling, or search by a different title or skill."
                }
                action={
                  <Button leftIcon="x" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            ) : filters.status ? (
              <EmptyState compact icon="briefcase" {...STATUS_EMPTY[filters.status]} />
            ) : (
              <EmptyState
                icon="briefcase"
                title="Create your first job"
                description="Write the role, list the skills it needs, and publish it to the job board when it is ready. It stays a private draft until then."
                action={
                  <ButtonLink to="/jobs/new" variant="primary" leftIcon="plus">
                    New job
                  </ButtonLink>
                }
              />
            )
          }
        />

        {data && data.total > 0 && (
          <div className="jobs-panel-footer">
            <Pagination
              total={data.total}
              limit={pageSize}
              offset={filters.offset}
              onChange={(offset) => setFilters({ offset })}
              pageSizeOptions={PAGE_SIZES}
              onLimitChange={setPageSize}
              noun="jobs"
            />
          </div>
        )}
      </Card>
    </>
  );
}
