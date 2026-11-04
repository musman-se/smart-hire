import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  APPLICATION_STAGES,
  TERMINAL_STAGES,
  type Application,
  type ApplicationStage,
  type Job,
} from "../../api/types";
import { ApplicationActions } from "../../components/applications/ApplicationActions";
import { isScoreStalled, matchesSearch } from "../../components/applications/stages";
import { useRescore } from "../../components/applications/useRescore";
import { useStageMove } from "../../components/applications/useStageMove";
import { jobName } from "../../components/jobs/jobName";
import { CandidateDrawer } from "../../components/pipeline/CandidateDrawer";
import {
  Avatar,
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  ErrorNotice,
  IconButton,
  Kbd,
  Notice,
  PageHeader,
  Pagination,
  ScoreRing,
  SearchInput,
  Select,
  Skeleton,
  StagePill,
  TabPanel,
  Tabs,
  Tooltip,
  formatDateTime,
  formatNumber,
  formatRelative,
  humanize,
  pluralize,
  sortRows,
  useToast,
  type Column,
  type SortState,
} from "../../components/ui";
import {
  useApplication,
  useCandidatesByIds,
  useJobsByIds,
  useProcessApplications,
  useStageCounts,
} from "../../hooks/queries";
import { useClampOffset } from "../../hooks/useClampOffset";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useHotkeys } from "../../hooks/useHotkeys";
import { useNow } from "../../hooks/useNow";
import { RECENT_JOBS_LIMIT, useApplicationQueue, useRecentJobs } from "../../hooks/useRecruiterExtras";
import { useTableFocusHandoff } from "../../hooks/useTableFocusHandoff";
import { urlParam, useUrlState } from "../../hooks/useUrlState";

const PAGE_SIZES = [25, 50, 100] as const;
const TAB_VALUES = ["all", ...APPLICATION_STAGES] as const;
const TABS_ID = "queue-stages";

/** Opens on "applied": a queue is about what is waiting, and new applications wait first. */
const QUEUE = {
  stage: urlParam.oneOf(TAB_VALUES, "applied"),
  // A job picked from a list, not typed: Back undoes it like a tab change.
  job: urlParam.string("", { history: "push" }),
  offset: urlParam.number(0, { min: 0 }),
  limit: urlParam.number(PAGE_SIZES[0], { min: 1, max: 100 }),
};

/** The application open in the drawer. Apart from QUEUE, so opening one does not send
 * the queue back to page one. */
const DRAWER = { applicant: urlParam.string() };

/** Applications this recent are flagged "New" in the queue. */
const NEW_FOR_MS = 24 * 60 * 60_000;

/** The recruiter's review queue across every job (/applications). Candidates get
 * MyApplicationsPage on the same route. */
export function ApplicationsPage() {
  useDocumentTitle("Applications");
  const navigate = useNavigate();
  const now = useNow();
  const searchRef = useRef<HTMLInputElement>(null);

  const [filters, setFilters] = useUrlState(QUEUE, { resetOnChange: "offset" });
  const [drawer, setDrawer] = useUrlState(DRAWER);
  // Search narrows the loaded page only, so it lives here rather than in the URL: a
  // shared link would otherwise promise a server-side search that does not exist.
  const [search, setSearch] = useState("");
  const stage: ApplicationStage | undefined = filters.stage === "all" ? undefined : filters.stage;
  const jobId = filters.job || undefined;

  const counts = useStageCounts({ jobId });
  const recentJobs = useRecentJobs();
  const queue = useApplicationQueue({
    stage,
    job_id: jobId,
    limit: filters.limit,
    offset: filters.offset,
  });
  const rows = queue.data?.items;
  useClampOffset(queue.data, filters.offset, filters.limit, (offset) =>
    setFilters({ offset }, { history: "replace" }),
  );

  // The open application as the queue has it. Once a move takes it out of this tab it
  // is read on its own, from the same cache entry the drawer reads.
  const listed = rows?.find((application) => application.id === drawer.applicant);
  const fetched = useApplication(listed ? "" : drawer.applicant);
  const opened = listed ?? fetched.data;

  const candidates = useCandidatesByIds(rows?.map((application) => application.candidate_id) ?? []);
  const jobIds = rows?.map((application) => application.job_id) ?? [];
  // The filtered job too, in case it is older than the picker's latest jobs, and the
  // open application's, which may have left the page.
  const jobs = useJobsByIds([...jobIds, ...(jobId ? [jobId] : []), ...(opened ? [opened.job_id] : [])]);
  const stageMove = useStageMove();
  const [sort, setSort] = useState<SortState | null>(null);

  const visibleRows = useMemo(
    () =>
      rows?.filter((application) =>
        matchesSearch(
          [
            candidates.byId.get(application.candidate_id)?.full_name,
            candidates.byId.get(application.candidate_id)?.email,
            jobs.byId.get(application.job_id)?.title,
          ],
          search,
        ),
      ),
    [rows, candidates.byId, jobs.byId, search],
  );
  const stalled = (rows ?? []).filter((application) => isScoreStalled(application, now));
  // A move takes its row out of this tab; focus goes on to the row that takes its place.
  useTableFocusHandoff();

  useHotkeys([
    {
      combo: "/",
      handler: (event) => {
        event.preventDefault();
        searchRef.current?.focus();
      },
    },
  ]);

  const candidateName = (application: Application) =>
    candidates.byId.get(application.candidate_id)?.full_name ?? "Candidate";
  const jobTitle = (application: Application) =>
    jobs.byId.get(application.job_id)?.title ?? "Job";

  const tabs = TAB_VALUES.map((value) => ({
    value,
    label: value === "all" ? "All" : humanize(value),
    count: value === "all" ? (counts.isLoading ? undefined : counts.total) : counts.counts[value],
  }));
  const activeCount = APPLICATION_STAGES.filter((value) => !TERMINAL_STAGES.has(value)).reduce(
    (sum, value) => sum + (counts.counts[value] ?? 0),
    0,
  );

  const jobOptions = useMemo(() => {
    const latest = recentJobs.data?.items ?? [];
    const selected = jobId ? jobs.byId.get(jobId) : undefined;
    // The filtered job leads when it is older than the latest ones listed.
    const listed =
      selected && !latest.some((job) => job.id === selected.id) ? [selected, ...latest] : latest;
    return listed.map((job) => ({ value: job.id, label: jobOptionLabel(job) }));
  }, [recentJobs.data, jobId, jobs.byId]);

  const columns: Column<Application>[] = [
    {
      key: "candidate",
      header: "Candidate",
      sortValue: (application) => candidates.byId.get(application.candidate_id)?.full_name,
      cell: (application) => {
        const candidate = candidates.byId.get(application.candidate_id);
        const isNew =
          application.stage === "applied" && now - Date.parse(application.created_at) < NEW_FOR_MS;
        if (!candidate) {
          return candidates.isLoading ? (
            <div className="queue-person">
              <Skeleton circle width="1.75rem" height="1.75rem" />
              <Skeleton width="8rem" />
            </div>
          ) : (
            <span className="subtle">Unknown candidate</span>
          );
        }
        return (
          <div className="queue-person">
            <Avatar name={candidate.full_name} size="sm" />
            <div className="queue-person-text">
              <span className="queue-person-name">
                <Link to={`/candidates/${candidate.id}`}>{candidate.full_name}</Link>
                {isNew && (
                  <Badge tone="accent" size="sm">
                    New
                  </Badge>
                )}
              </span>
              <span className="queue-person-sub truncate">{candidate.headline || candidate.email}</span>
            </div>
          </div>
        );
      },
    },
    {
      key: "job",
      header: "Job",
      className: "queue-col-job",
      sortValue: (application) => jobs.byId.get(application.job_id)?.title,
      cell: (application) => {
        const job = jobs.byId.get(application.job_id);
        if (!job) return jobs.isLoading ? <Skeleton width="7rem" /> : <span className="subtle">Unavailable</span>;
        return (
          <div className="queue-job">
            <Link to={`/jobs/${job.id}`} className="truncate">
              {job.title}
            </Link>
            {job.department && <span className="queue-person-sub truncate">{job.department}</span>}
          </div>
        );
      },
    },
    {
      key: "stage",
      header: "Stage",
      sortValue: (application) => APPLICATION_STAGES.indexOf(application.stage),
      cell: (application) => <StagePill stage={application.stage} />,
    },
    {
      key: "score",
      header: "Match",
      align: "center",
      sortValue: (application) => application.match_score,
      cell: (application) => <ScoreCell application={application} now={now} />,
    },
    {
      key: "applied",
      header: "Applied",
      className: "queue-col-applied",
      sortValue: (application) => application.created_at,
      cell: (application) => (
        <time dateTime={application.created_at} title={formatDateTime(application.created_at)} className="muted">
          {formatRelative(application.created_at, now)}
        </time>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (application) => (
        <ApplicationActions
          application={application}
          candidateName={candidateName(application)}
          jobTitle={jobTitle(application)}
          disabled={queue.isPlaceholderData}
          onOpen={() => setDrawer({ applicant: application.id })}
        />
      ),
    },
  ];

  // Previous and next follow the rows in the order they are shown.
  const orderedRows = visibleRows ? sortRows(visibleRows, columns, sort) : [];
  const openIndex = orderedRows.findIndex((application) => application.id === drawer.applicant);
  const openJob = opened && jobs.byId.get(opened.job_id);

  const stageLabel = stage ? humanize(stage) : "any stage";
  const empty =
    search && rows && rows.length > 0 ? (
      <EmptyState
        compact
        icon="search"
        title={`Nothing on this page matches “${search}”`}
        description={`Search covers the ${pluralize(rows.length, "application")} loaded here. Clear it, or page through the rest.`}
        action={<Button onClick={() => setSearch("")}>Clear search</Button>}
      />
    ) : stage === "applied" ? (
      <EmptyState
        icon="check-circle"
        title="Inbox zero"
        description={
          jobId
            ? "Every application to this job has been looked at."
            : "Every new application has been screened. New ones land here first."
        }
        action={<Button onClick={() => setFilters({ stage: "screening" })}>Go to Screening</Button>}
      />
    ) : (
      <EmptyState
        icon="inbox"
        title={stage ? `No applications in ${stageLabel}` : "No applications yet"}
        description={
          jobId
            ? "Nothing for this job here. Try another stage, or all jobs."
            : "Applications appear here as candidates apply to published jobs."
        }
        action={
          jobId ? (
            <Button onClick={() => setFilters({ job: "" })}>Show all jobs</Button>
          ) : (
            <Button onClick={() => setFilters({ stage: "all" })}>Show every stage</Button>
          )
        }
      />
    );

  return (
    <div className="stack queue-page">
      <PageHeader
        title="Applications"
        description="Every application across every job. Screen, advance and reject without leaving the queue."
        meta={
          !counts.isLoading && (
            <>
              <Badge tone="accent" dot>
                {formatNumber(activeCount)} in progress
              </Badge>
              <Badge tone="neutral">{formatNumber(counts.counts.applied ?? 0)} awaiting screening</Badge>
            </>
          )
        }
      />

      <Card padding="none" className="queue-panel">
        <Tabs
          id={TABS_ID}
          className="queue-tabs"
          aria-label="Filter by stage"
          items={tabs}
          value={filters.stage}
          onChange={(value) => setFilters({ stage: value })}
        />

        <div className="queue-toolbar">
          <Select
            className="queue-job-filter"
            aria-label="Filter by job"
            value={filters.job}
            placeholder={recentJobs.isLoading ? "Loading jobs…" : "All jobs"}
            options={jobOptions}
            onChange={(event) => setFilters({ job: event.target.value })}
          />
          {jobId && (
            <IconButton
              icon="kanban"
              variant="secondary"
              aria-label="Open this job's pipeline"
              onClick={() => navigate(`/jobs/${jobId}/pipeline`)}
            />
          )}
          <SearchInput
            ref={searchRef}
            className="queue-search"
            value={search}
            onValueChange={setSearch}
            placeholder="Search this page"
            aria-label="Search loaded applications by candidate or job"
            aria-keyshortcuts="/"
          />
          <span className="spacer" />
          <span className="subtle text-sm queue-hint">
            Newest first · sorting and search cover this page · <Kbd>/</Kbd> to search
          </span>
        </div>

        {recentJobs.data && recentJobs.data.total > RECENT_JOBS_LIMIT && (
          <p className="queue-note subtle text-xs">
            The job filter lists the latest {RECENT_JOBS_LIMIT} jobs. Open older ones from Jobs.
          </p>
        )}

        <TabPanel tabsId={TABS_ID} value={filters.stage} className="queue-tabpanel">
          {stalled.length > 0 && <StalledNotice applications={stalled} />}

          {queue.error && (
            <div className="queue-error">
              <ErrorNotice error={queue.error} />
            </div>
          )}

          <DataTable
            // The previous tab's or page's rows stay up until the next arrive: dimmed,
            // with their actions disabled.
            className={queue.isPlaceholderData ? "is-stale" : undefined}
            caption={`Applications, ${stageLabel}`}
            columns={columns}
            rows={visibleRows}
            getRowId={(application) => application.id}
            loading={queue.isLoading || queue.isFetching}
            skeletonRows={8}
            empty={empty}
            error={queue.error}
            onRetry={() => void queue.refetch()}
            sort={sort}
            onSortChange={setSort}
            onRowClick={(application) => setDrawer({ applicant: application.id })}
            rowClassName={(application) =>
              isScoreStalled(application, now) ? "queue-row-stalled" : undefined
            }
          />

          {queue.data && queue.data.total > 0 && (
            <div className="queue-footer">
              <Pagination
                total={queue.data.total}
                limit={filters.limit}
                offset={filters.offset}
                onChange={(offset) => setFilters({ offset })}
                pageSizeOptions={PAGE_SIZES}
                onLimitChange={(limit) => setFilters({ limit })}
                noun="applications"
              />
            </div>
          )}
        </TabPanel>
      </Card>

      {openJob && (
        <CandidateDrawer
          job={openJob}
          applicationId={drawer.applicant}
          application={listed}
          onClose={() => setDrawer({ applicant: "" })}
          onRequestMove={(application, to) =>
            stageMove.requestMove({
              application,
              stage: to,
              candidateName: candidateName(application),
              jobTitle: openJob.title,
            })
          }
          onPrevious={
            openIndex > 0 ? () => setDrawer({ applicant: orderedRows[openIndex - 1]?.id ?? "" }) : undefined
          }
          onNext={
            openIndex >= 0 && openIndex < orderedRows.length - 1
              ? () => setDrawer({ applicant: orderedRows[openIndex + 1]?.id ?? "" })
              : undefined
          }
        />
      )}
      {stageMove.dialog}
    </div>
  );
}

/** "Frontend Engineer · Engineering · Lahore (Draft)": named in full, since titles repeat
 * across departments, with the status unless it is live. */
function jobOptionLabel(job: Job): string {
  return job.status === "published" ? jobName(job) : `${jobName(job)} (${humanize(job.status)})`;
}

/** Shown when scoring never ran for some rows — usually a worker that was down. */
function StalledNotice({ applications }: { applications: readonly Application[] }) {
  const processAll = useProcessApplications();
  const toast = useToast();

  function rescoreAll() {
    void toast.promise(
      processAll.mutateAsync(applications.map((application) => application.id)),
      {
        loading: `Scoring ${pluralize(applications.length, "application")}…`,
        success: (results) => {
          const failed = results.filter((result) => result.status === "rejected").length;
          return failed === 0
            ? "Scoring started. Scores appear in a moment."
            : `Started ${results.length - failed}; ${failed} could not be queued.`;
        },
      },
    );
  }

  return (
    <div className="queue-stalled">
      <Notice
        tone="warning"
        title={`${pluralize(applications.length, "application")} on this page never got a score`}
        action={
          <Button size="sm" leftIcon="refresh" loading={processAll.isPending} onClick={rescoreAll}>
            Re-run scoring
          </Button>
        }
      >
        Scoring normally finishes a second after someone applies. These rows are highlighted.
      </Notice>
    </div>
  );
}

/** The score, or — when scoring never ran — a way to run it again right there. */
function ScoreCell({ application, now }: { application: Application; now: number }) {
  const { rescore, isPending } = useRescore();
  if (!isScoreStalled(application, now)) {
    return <ScoreRing score={application.match_score} size={32} strokeWidth={3} />;
  }
  return (
    <Tooltip content="Never scored. Re-run scoring">
      <IconButton
        icon="refresh"
        size="sm"
        variant="secondary"
        aria-label="Re-run scoring"
        disabled={isPending}
        onClick={() => rescore(application.id)}
      />
    </Tooltip>
  );
}
