import { useCallback, useMemo } from "react";
import { Link, useParams } from "react-router-dom";

import { ApiError } from "../../api/client";
import type { Application, ApplicationStage } from "../../api/types";
import { CandidateDrawer } from "../../components/pipeline/CandidateDrawer";
import {
  BOARD_COLUMNS,
  BOARD_SORTS,
  applicantName,
  buildBoard,
  type BoardColumn,
  type BoardSort,
} from "../../components/pipeline/model";
import { PipelineBoard } from "../../components/pipeline/PipelineBoard";
import { useStageChange } from "../../components/pipeline/useStageChange";
import {
  Button,
  ButtonLink,
  EmptyState,
  ErrorNotice,
  Icon,
  Notice,
  PageHeader,
  SearchInput,
  SegmentedControl,
  Skeleton,
  StatusPill,
  formatNumber,
  pluralize,
} from "../../components/ui";
import { useJob, useStageCounts } from "../../hooks/queries";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useJobApplicants } from "../../hooks/usePipeline";
import { urlParam, useUrlState } from "../../hooks/useUrlState";

const BOARD_PARAMS = {
  q: urlParam.string(),
  // A slider: dragging it must not fill the history with every step.
  min: urlParam.number(0, { min: 0, max: 100, history: "replace" }),
  sort: urlParam.oneOf(BOARD_SORTS, "score"),
  applicant: urlParam.string(),
};

const SORT_OPTIONS: { value: BoardSort; label: string }[] = [
  { value: "score", label: "Best match" },
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
];

/** The newest-first page the board shows; the server pages at 100. */
const BOARD_LIMIT = 100;

/** The hiring board for one job (/jobs/:jobId/pipeline). Recruiters only. */
export function PipelinePage() {
  const { jobId = "" } = useParams();
  const { data: job, error: jobError, isLoading: jobLoading } = useJob(jobId);
  const { applications, candidatesById } = useJobApplicants(jobId);
  const [params, setParams] = useUrlState(BOARD_PARAMS);
  const [showClosed, setShowClosed] = useLocalStorage("smarthire.pipeline.showClosed", false);

  useDocumentTitle(job ? `Pipeline · ${job.title}` : "Pipeline");

  const nameOf = useCallback(
    (application: Application) => applicantName(candidatesById.get(application.candidate_id)),
    [candidatesById],
  );
  const stageChange = useStageChange(jobId, nameOf);

  const items = applications.data?.items;
  const filtering = params.q.trim() !== "" || params.min > 0;

  const { columns, totals } = useMemo(
    () => buildBoard(items ?? [], candidatesById, { search: params.q, minScore: params.min }, params.sort),
    [items, candidatesById, params.q, params.min, params.sort],
  );

  // The drawer steps through the cards in the order the board shows them.
  const order = BOARD_COLUMNS.flatMap((column) => (column === "closed" && !showClosed ? [] : columns[column]));
  const openIndex = order.findIndex((a) => a.id === params.applicant);
  const open = (application: Application | undefined) => setParams({ applicant: application?.id ?? "" });

  const visibleCount = order.length;
  const total = applications.data?.total ?? 0;
  // The board holds one page. When the job has more, each column also gets its true
  // size from the server's per-stage counts, so "Applied 37" is not read as the backlog.
  const partial = items !== undefined && items.length < total;
  const stageCounts = useStageCounts({ jobId, enabled: partial });
  const serverTotals = partial ? columnTotals(stageCounts.counts) : undefined;
  const filterSummary = filtering && items ? describeMatches(visibleCount, params.min > 0) : "";

  const breadcrumbs = [
    { label: "Jobs", to: "/jobs" },
    { label: job?.title ?? "Job", to: `/jobs/${jobId}` },
    { label: "Pipeline" },
  ];

  if (jobError) {
    const missing = jobError instanceof ApiError && jobError.status === 404;
    return (
      <>
        <PageHeader title="Pipeline" breadcrumbs={breadcrumbs.slice(0, 1)} />
        {missing ? (
          <EmptyState
            icon="briefcase"
            title="This job no longer exists"
            description="It may have been deleted. Its applications went with it."
            action={<ButtonLink to="/jobs">Back to jobs</ButtonLink>}
          />
        ) : (
          <ErrorNotice error={jobError} />
        )}
      </>
    );
  }

  return (
    <div className="pipeline-page">
      <PageHeader
        breadcrumbs={breadcrumbs}
        title={jobLoading ? <Skeleton width="16rem" height="1.75rem" /> : job?.title}
        meta={
          job && (
            <>
              <StatusPill status={job.status} />
              <span className="meta-item">
                <Icon name="users" />
                {pluralize(total, "applicant")}
              </span>
              {typeof job.max_applications === "number" && (
                <span className="meta-item">
                  <Icon name="target" />
                  Cap of {formatNumber(job.max_applications)}
                </span>
              )}
            </>
          )
        }
        actions={
          <>
            <ButtonLink to={`/jobs/${jobId}?tab=applicants`} leftIcon="list" variant="ghost">
              Table view
            </ButtonLink>
            <ButtonLink to={`/jobs/${jobId}`} leftIcon="briefcase">
              Job details
            </ButtonLink>
          </>
        }
      />

      <div className="pipeline-toolbar" role="search" aria-label="Filter applicants">
        <SearchInput
          className="pipeline-search"
          value={params.q}
          onValueChange={(q) => setParams({ q })}
          placeholder="Search name, email or headline"
          aria-label="Search applicants"
        />
        <label className="pipeline-range">
          <span className="text-sm muted">Min. match</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={params.min}
            aria-valuetext={params.min === 0 ? "Any score" : `${params.min} or above`}
            onChange={(event) => setParams({ min: Number(event.target.value) })}
          />
          <output className="pipeline-range-value tabular">{params.min === 0 ? "Any" : `${params.min}+`}</output>
        </label>
        <SegmentedControl
          size="sm"
          aria-label="Order cards by"
          options={SORT_OPTIONS}
          value={params.sort}
          onChange={(sort) => setParams({ sort })}
        />
        {filtering && (
          <Button size="sm" variant="ghost" leftIcon="x" onClick={() => setParams({ q: "", min: 0 })}>
            Clear filters
          </Button>
        )}
      </div>

      <ErrorNotice error={applications.error} />

      {total > BOARD_LIMIT && (
        // The job's applicants table has the same cap, so only the queue, which pages on
        // the server, reaches the older ones. "all" because the queue opens on Applied.
        <Notice tone="info">
          The board shows the latest {BOARD_LIMIT} of {formatNumber(total)} applications.{" "}
          <Link to={`/applications?job=${jobId}&stage=all`}>
            See all {formatNumber(total)} in the applications queue
          </Link>
          .
        </Notice>
      )}
      {filterSummary && <p className="text-sm muted">{filterSummary}</p>}
      {/* Mounted before it has anything to say: a live region that arrives with its text
          already in it is usually not announced. */}
      <p className="sr-only" aria-live="polite">
        {filterSummary}
      </p>

      {applications.isLoading || jobLoading ? (
        <BoardSkeleton />
      ) : job && items && items.length === 0 ? (
        <EmptyState
          icon="kanban"
          title={job.status === "published" ? "No applicants yet" : "This job is not live"}
          description={
            job.status === "published"
              ? "Applications appear in the Applied column as they arrive, already scored against this job."
              : "Publish it to start receiving applications — they will appear here, scored against the job."
          }
          action={
            <ButtonLink to={`/jobs/${jobId}`} variant="primary">
              {job.status === "published" ? "View the job posting" : "Go to the job"}
            </ButtonLink>
          }
        />
      ) : (
        job && (
          <PipelineBoard
            job={job}
            columns={columns}
            totals={totals}
            serverTotals={serverTotals}
            candidatesById={candidatesById}
            showClosed={showClosed}
            onShowClosedChange={setShowClosed}
            pendingId={stageChange.pendingId}
            onOpen={open}
            onRequestMove={stageChange.requestMove}
          />
        )
      )}

      {job && (
        <CandidateDrawer
          job={job}
          applicationId={params.applicant}
          application={items?.find((a) => a.id === params.applicant)}
          onClose={() => open(undefined)}
          onRequestMove={stageChange.requestMove}
          onPrevious={openIndex > 0 ? () => open(order[openIndex - 1]) : undefined}
          onNext={openIndex >= 0 && openIndex < order.length - 1 ? () => open(order[openIndex + 1]) : undefined}
        />
      )}
      {stageChange.dialog}
    </div>
  );
}

function describeMatches(count: number, minScoreSet: boolean): string {
  const matches =
    count === 0 ? "No applicants match these filters." : `${pluralize(count, "applicant")} match${count === 1 ? "es" : ""}.`;
  return minScoreSet ? `${matches} Unscored applications are hidden while a minimum is set.` : matches;
}

/** Per-stage server counts folded into board columns. A column whose count has not
 * arrived (or failed) is left out, and the board falls back to what it holds. */
function columnTotals(
  counts: Record<ApplicationStage, number | undefined>,
): Partial<Record<BoardColumn, number>> {
  const { rejected, withdrawn } = counts;
  return {
    applied: counts.applied,
    screening: counts.screening,
    interview: counts.interview,
    offer: counts.offer,
    hired: counts.hired,
    closed: rejected === undefined || withdrawn === undefined ? undefined : rejected + withdrawn,
  };
}

/** Cards per column while loading: a funnel, as a real board tends to be. */
const SKELETON_CARDS = [3, 2, 2, 1, 1];

function BoardSkeleton() {
  return (
    <div className="pipeline-board" aria-busy="true" aria-label="Loading the board">
      {SKELETON_CARDS.map((cards, column) => (
        <div key={column} className="pipeline-column">
          <Skeleton width="6rem" />
          {Array.from({ length: cards }, (_, i) => (
            <Skeleton key={i} height="5.5rem" />
          ))}
        </div>
      ))}
    </div>
  );
}
