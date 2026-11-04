import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  APPLICATION_STAGES,
  type Application,
  type ApplicationStage,
  type Candidate,
  type Job,
} from "../../api/types";
import { useProcessApplication } from "../../hooks/queries";
import { useNow } from "../../hooks/useNow";
import { useJobApplicants } from "../../hooks/usePipeline";
import {
  Avatar,
  Button,
  ButtonLink,
  DataTable,
  DropdownMenu,
  EmptyState,
  ErrorNotice,
  IconButton,
  ScoreRing,
  SearchInput,
  Skeleton,
  StagePill,
  compareValues,
  formatDateTime,
  formatNumber,
  formatRelative,
  humanize,
  skillMatch,
  useToast,
  type Column,
  type MenuEntry,
  type SortState,
} from "../ui";
import { isScoreStalled, recruiterTargets } from "../applications/stages";
import { CandidateDrawer } from "../pipeline/CandidateDrawer";
import { applicantName, countByStage, matchesFilters, moveLabel } from "../pipeline/model";
import { useStageChange } from "../pipeline/useStageChange";

export interface ApplicantFilterState {
  stage: ApplicationStage | "";
  q: string;
}

export interface ApplicantsTabProps {
  job: Job;
  filters: ApplicantFilterState;
  onFiltersChange: (patch: Partial<ApplicantFilterState>) => void;
  /** The application open in the drawer, kept in the URL so it can be shared. */
  openId: string;
  onOpenChange: (applicationId: string) => void;
}

/** The server pages at 100; the table shows the newest page. */
const TABLE_LIMIT = 100;

const DEFAULT_SORT: SortState = { key: "match", direction: "desc" };

/**
 * Every applicant to one job as a sortable table — the dense alternative to the board,
 * for comparing people side by side. A row opens the same drawer the board does.
 */
export function ApplicantsTab({ job, filters, onFiltersChange, openId, onOpenChange }: ApplicantsTabProps) {
  const { applications, candidatesById } = useJobApplicants(job.id);
  const [sort, setSort] = useState<SortState | null>(DEFAULT_SORT);
  // Ticks so a row whose score never came gains "Re-run scoring" once polling has stopped.
  const now = useNow();

  const nameOf = useCallback(
    (application: Application) => applicantName(candidatesById.get(application.candidate_id)),
    [candidatesById],
  );
  const stageChange = useStageChange(job.id, nameOf);

  const items = applications.data?.items;
  const total = applications.data?.total ?? 0;
  const counts = useMemo(() => countByStage(items ?? []), [items]);

  const columns = useMemo(
    () => applicantColumns(job, candidatesById, stageChange.requestMove, onOpenChange, now),
    [job, candidatesById, stageChange.requestMove, onOpenChange, now],
  );

  const rows = useMemo(() => {
    const shown = (items ?? []).filter(
      (a) =>
        (!filters.stage || a.stage === filters.stage) &&
        matchesFilters(a, candidatesById.get(a.candidate_id), { search: filters.q, minScore: 0 }),
    );
    return sortRows(shown, columns, sort);
  }, [items, candidatesById, filters.stage, filters.q, columns, sort]);

  const openIndex = rows.findIndex((a) => a.id === openId);
  const filtering = filters.stage !== "" || filters.q.trim() !== "";

  if (applications.error) return <ErrorNotice error={applications.error} />;

  if (items && items.length === 0) {
    return (
      <EmptyState
        icon="users"
        title="No applicants yet"
        description={
          job.status === "published"
            ? "Applications appear here as candidates apply, each scored against this job a moment later."
            : "Publish the job and applications will appear here, each scored against it."
        }
      />
    );
  }

  return (
    <div className="stack">
      <div className="job-detail-toolbar">
        <SearchInput
          value={filters.q}
          onValueChange={(q) => onFiltersChange({ q })}
          placeholder="Search name, email or headline"
          aria-label="Search applicants"
          className="job-detail-search"
        />
        <ButtonLink to={`/jobs/${job.id}/pipeline`} size="sm" variant="ghost" leftIcon="kanban">
          Board view
        </ButtonLink>
        <div className="job-detail-chips" role="group" aria-label="Filter by stage">
          <StageChip label="All" count={items?.length} pressed={filters.stage === ""} onClick={() => onFiltersChange({ stage: "" })} />
          {APPLICATION_STAGES.map((stage) => (
            <StageChip
              key={stage}
              stage={stage}
              label={humanize(stage)}
              count={items ? counts[stage] : undefined}
              pressed={filters.stage === stage}
              onClick={() => onFiltersChange({ stage: filters.stage === stage ? "" : stage })}
            />
          ))}
        </div>
      </div>

      <DataTable
        caption={`Applicants to ${job.title}`}
        columns={columns}
        rows={items ? rows : undefined}
        getRowId={(a) => a.id}
        loading={applications.isLoading}
        sort={sort}
        onSortChange={setSort}
        onRowClick={(a) => onOpenChange(a.id)}
        rowClassName={(a) => (a.id === stageChange.pendingId ? "job-detail-row-pending" : undefined)}
        empty={
          <EmptyState
            compact
            icon="search"
            title="No applicants match"
            description={filters.stage ? `Nobody is in ${humanize(filters.stage)} with these filters.` : "Try another name or email."}
            action={
              filtering && (
                <Button size="sm" onClick={() => onFiltersChange({ stage: "", q: "" })}>
                  Clear filters
                </Button>
              )
            }
          />
        }
      />
      {items && (
        <p className="text-xs subtle">
          {total > TABLE_LIMIT ? (
            // The queue pages on the server, so it is the one place the older ones are reachable.
            <>
              Showing the latest {TABLE_LIMIT} of {formatNumber(total)} applications; sorting applies to these.{" "}
              <Link to={`/applications?job=${job.id}&stage=all`}>Page through all of them</Link>.
            </>
          ) : (
            "Sorting applies to the list as loaded. Click a row for the full application."
          )}
        </p>
      )}

      <CandidateDrawer
        job={job}
        applicationId={openId}
        application={items?.find((a) => a.id === openId)}
        onClose={() => onOpenChange("")}
        onRequestMove={stageChange.requestMove}
        onPrevious={openIndex > 0 ? () => onOpenChange(rows[openIndex - 1]?.id ?? "") : undefined}
        onNext={openIndex >= 0 && openIndex < rows.length - 1 ? () => onOpenChange(rows[openIndex + 1]?.id ?? "") : undefined}
      />
      {stageChange.dialog}
    </div>
  );
}

function StageChip({
  stage,
  label,
  count,
  pressed,
  onClick,
}: {
  stage?: ApplicationStage;
  label: string;
  count: number | undefined;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="job-detail-chip"
      data-stage={stage}
      aria-pressed={pressed}
      disabled={!pressed && count === 0}
      onClick={onClick}
    >
      {stage && <span className="job-detail-chip-dot" aria-hidden="true" />}
      {label}
      <span className="job-detail-chip-count tabular">{count ?? "–"}</span>
    </button>
  );
}

/**
 * The same ordering DataTable applies, so the drawer's previous/next follow the rows on
 * screen. The direction goes to compareValues rather than flipping its result: flipping
 * would also move unscored rows to the top, where the table never shows them.
 */
function sortRows(rows: Application[], columns: readonly Column<Application>[], sort: SortState | null): Application[] {
  const sortValue = sort && columns.find((c) => c.key === sort.key)?.sortValue;
  if (!sort || !sortValue) return rows;
  return [...rows].sort((a, b) => compareValues(sortValue(a), sortValue(b), sort.direction));
}

function applicantColumns(
  job: Job,
  candidatesById: ReadonlyMap<string, Candidate>,
  requestMove: (application: Application, stage: ApplicationStage) => void,
  open: (applicationId: string) => void,
  now: number,
): Column<Application>[] {
  return [
    {
      key: "candidate",
      header: "Applicant",
      sortValue: (a) => applicantName(candidatesById.get(a.candidate_id)),
      cell: (a) => <ApplicantCell candidate={candidatesById.get(a.candidate_id)} />,
    },
    {
      key: "match",
      header: "Match",
      width: "10rem",
      sortValue: (a) => a.match_score,
      firstSortDirection: "desc",
      cell: (a) => <MatchCell application={a} candidate={candidatesById.get(a.candidate_id)} job={job} />,
    },
    {
      key: "stage",
      header: "Stage",
      width: "8rem",
      sortValue: (a) => APPLICATION_STAGES.indexOf(a.stage),
      cell: (a) => <StagePill stage={a.stage} />,
    },
    {
      key: "applied",
      header: "Applied",
      width: "8rem",
      sortValue: (a) => a.created_at,
      cell: (a) => (
        <time dateTime={a.created_at} title={formatDateTime(a.created_at)} className="muted">
          {formatRelative(a.created_at)}
        </time>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      width: "3.5rem",
      align: "right",
      cell: (a) => (
        <RowActions
          application={a}
          name={applicantName(candidatesById.get(a.candidate_id))}
          onRequestMove={requestMove}
          onOpen={() => open(a.id)}
          stalled={isScoreStalled(a, now)}
        />
      ),
    },
  ];
}

function ApplicantCell({ candidate }: { candidate: Candidate | undefined }) {
  if (!candidate) {
    return (
      <div className="row">
        <Skeleton circle width="2rem" height="2rem" />
        <Skeleton width="8rem" />
      </div>
    );
  }
  const name = applicantName(candidate);
  return (
    <div className="job-detail-applicant">
      <Avatar name={name} size="sm" />
      <div className="job-detail-applicant-text">
        <span className="job-detail-applicant-name">{name}</span>
        <span className="text-xs muted truncate">{candidate.headline || candidate.email}</span>
      </div>
    </div>
  );
}

function MatchCell({ application, candidate, job }: { application: Application; candidate: Candidate | undefined; job: Job }) {
  const required = job.required_skills ?? [];
  const { matched } = skillMatch(candidate?.skills, required);
  return (
    <div className="row">
      <ScoreRing score={application.match_score} size={32} strokeWidth={3} />
      {required.length > 0 && candidate && (
        <span className="text-xs muted tabular" title="Required skills they have">
          {matched.length}/{required.length} skills
        </span>
      )}
    </div>
  );
}

function RowActions({
  application,
  name,
  onRequestMove,
  onOpen,
  stalled,
}: {
  application: Application;
  name: string;
  onRequestMove: (application: Application, stage: ApplicationStage) => void;
  onOpen: () => void;
  /** Unscored past the wait: scoring never ran, so offer to run it again. */
  stalled: boolean;
}) {
  const process = useProcessApplication();
  const toast = useToast();
  const targets = recruiterTargets(application.stage);

  const items: MenuEntry[] = [
    { label: "Open details", icon: "eye", onSelect: onOpen },
    { label: "Full profile", icon: "user", to: `/candidates/${application.candidate_id}` },
    ...(targets.length > 0 ? [{ type: "separator" as const }, { type: "label" as const, label: "Move to" }] : []),
    ...targets.map(
      (stage): MenuEntry => ({
        label: moveLabel(stage),
        icon: stage === "rejected" ? "x-circle" : "arrow-right",
        danger: stage === "rejected",
        onSelect: () => onRequestMove(application, stage),
      }),
    ),
    ...(stalled
      ? [
          { type: "separator" as const },
          {
            label: "Re-run scoring",
            icon: "refresh" as const,
            onSelect: () =>
              process.mutate(application.id, {
                onSuccess: () => toast.info("Scoring queued", { description: `${name}'s score updates in a moment.` }),
                onError: (error) => toast.error(error),
              }),
          },
        ]
      : []),
  ];

  return (
    <DropdownMenu
      align="end"
      items={items}
      aria-label={`Actions for ${name}`}
      trigger={(props) => <IconButton {...props} icon="more-horizontal" size="sm" aria-label={`Actions for ${name}`} />}
    />
  );
}

