import { useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";

import type { Candidate } from "../api/types";
import { CandidateCard } from "../components/candidates/CandidateCard";
import { SkillFilter } from "../components/candidates/SkillFilter";
import { candidatesToCsv, csvFileName, downloadCsv } from "../components/candidates/csv";
import { emailList, reconcileSelection } from "../components/candidates/selection";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  CopyButton,
  DataTable,
  EmptyState,
  ErrorNotice,
  Kbd,
  PageHeader,
  Pagination,
  SearchInput,
  SegmentedControl,
  Select,
  Skeleton,
  SkeletonText,
  Tags,
  formatDate,
  formatNumber,
  formatRelative,
  formatYears,
  pluralize,
  useToast,
  type Column,
} from "../components/ui";
import { useCandidates } from "../hooks/queries";
import { useClampOffset } from "../hooks/useClampOffset";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useHotkeys } from "../hooks/useHotkeys";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { urlParam, useUrlState } from "../hooks/useUrlState";

const PAGE_SIZES = [25, 50, 100] as const;

const FILTERS = {
  q: urlParam.string(),
  skill: urlParam.string(),
  exp: urlParam.optionalNumber(),
  offset: urlParam.number(0, { min: 0 }),
  limit: urlParam.number(PAGE_SIZES[0], { min: 1, max: 100 }),
};

const EXPERIENCE_OPTIONS = [1, 2, 3, 5, 8, 10].map((years) => ({
  value: String(years),
  label: `${years}+ years`,
}));

type View = "table" | "grid";
const VIEW_OPTIONS = [
  { value: "table" as const, label: "Table", icon: "list" as const },
  { value: "grid" as const, label: "Cards", icon: "grid" as const },
];

/** The talent directory: everyone who has registered, searchable and exportable. */
export function CandidatesPage() {
  useDocumentTitle("Candidates");
  const navigate = useNavigate();
  const toast = useToast();
  const searchRef = useRef<HTMLInputElement>(null);

  const [filters, setFilters] = useUrlState(FILTERS, { resetOnChange: "offset" });
  const [storedView, setView] = useLocalStorage<View>("smarthire.candidates.view", "table");
  const view: View = storedView === "grid" ? "grid" : "table";
  const [selected, setSelected] = useState<ReadonlyMap<string, Candidate>>(new Map());

  // The URL updates on every keystroke; the request waits for a pause.
  const search = useDebouncedValue(filters.q.trim());
  const { data, error, isLoading, isFetching, refetch } = useCandidates({
    search: search || undefined,
    skill: filters.skill || undefined,
    min_experience: filters.exp,
    limit: filters.limit,
    offset: filters.offset,
  });
  const rows = data?.items;
  useClampOffset(data, filters.offset, filters.limit, (offset) =>
    setFilters({ offset }, { history: "replace" }),
  );
  const hasFilters = Boolean(filters.q || filters.skill || filters.exp !== undefined);
  const highlight = useMemo(() => (filters.skill ? [filters.skill] : undefined), [filters.skill]);

  useHotkeys([
    {
      combo: "/",
      handler: (event) => {
        event.preventDefault();
        searchRef.current?.focus();
      },
    },
  ]);

  function clearFilters() {
    setFilters({ q: "", skill: "", exp: undefined });
  }

  function selectIds(ids: ReadonlySet<string>) {
    setSelected((previous) => reconcileSelection(previous, ids, rows ?? []));
  }

  function toggleOne(id: string) {
    const ids = new Set(selected.keys());
    if (ids.has(id)) ids.delete(id);
    else ids.add(id);
    selectIds(ids);
  }

  /** The selection when there is one, otherwise the page on screen. */
  const exportRows: readonly Candidate[] = selected.size > 0 ? [...selected.values()] : (rows ?? []);
  const exportScope = selected.size > 0 ? `${selected.size} selected` : "this page";

  function exportCsv() {
    downloadCsv(csvFileName("candidates"), candidatesToCsv(exportRows));
    toast.success(`Exported ${pluralize(exportRows.length, "candidate")}`, {
      description: "Opens in Excel, Numbers or Google Sheets.",
    });
  }

  async function copyEmails() {
    try {
      await navigator.clipboard.writeText(emailList(exportRows));
      toast.success(`Copied ${pluralize(exportRows.length, "email")}`, {
        description: "One per line, ready for the To field.",
      });
    } catch {
      toast.error("Could not reach the clipboard", {
        description: "Your browser blocked it. Export a CSV instead.",
      });
    }
  }

  const columns: Column<Candidate>[] = [
    {
      key: "name",
      header: "Candidate",
      sortValue: (candidate) => candidate.full_name,
      cell: (candidate) => (
        <div className="candidates-person">
          <Avatar name={candidate.full_name} size="sm" />
          <div className="candidates-person-text">
            <Link to={`/candidates/${candidate.id}`} className="candidates-person-name">
              {candidate.full_name}
            </Link>
            <span className="candidates-person-headline truncate">
              {candidate.headline || "No headline yet"}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: "email",
      header: "Email",
      className: "candidates-col-email",
      cell: (candidate) => (
        <span className="candidates-email">
          <span className="truncate">{candidate.email}</span>
          <CopyButton value={candidate.email} label={`${candidate.full_name}'s email`} />
        </span>
      ),
    },
    {
      key: "experience",
      header: "Experience",
      align: "right",
      sortValue: (candidate) => candidate.years_experience,
      cell: (candidate) => <span className="tabular">{formatYears(candidate.years_experience)}</span>,
    },
    {
      key: "skills",
      header: "Skills",
      className: "candidates-col-skills",
      cell: (candidate) => <Tags items={candidate.skills ?? []} highlight={highlight} max={4} />,
    },
    {
      key: "registered",
      header: "Joined",
      className: "candidates-col-joined",
      sortValue: (candidate) => candidate.created_at,
      cell: (candidate) => (
        <time dateTime={candidate.created_at} title={formatDate(candidate.created_at)} className="muted">
          {formatRelative(candidate.created_at)}
        </time>
      ),
    },
  ];

  const empty = hasFilters ? (
    <EmptyState
      icon="search"
      title="No candidates match these filters"
      description="Try a shorter name, a related skill, or less experience."
      action={
        <Button leftIcon="x" onClick={clearFilters}>
          Clear filters
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon="users"
      title="No candidates yet"
      description="Candidates join by creating an account. Share the sign-up link to start building your talent pool."
      action={<SignUpLinkButton />}
    />
  );

  const pageIds = rows?.map((candidate) => candidate.id) ?? [];
  const pageSelected = pageIds.filter((id) => selected.has(id)).length;

  return (
    <div className="stack candidates-page">
      <PageHeader
        title="Candidates"
        description="Everyone who has registered. Search, filter and shortlist, then export or reach out."
        meta={
          data && (
            <Badge tone="neutral" icon="users">
              {pluralize(data.total, "candidate")}
            </Badge>
          )
        }
      />

      <Card padding="none" className="candidates-panel">
        <div className="candidates-toolbar" role="search" aria-label="Filter candidates">
          <SearchInput
            ref={searchRef}
            className="candidates-search"
            value={filters.q}
            onValueChange={(q) => setFilters({ q })}
            placeholder="Search by name"
            aria-label="Search candidates by name"
            aria-keyshortcuts="/"
          />
          <SkillFilter value={filters.skill} onChange={(skill) => setFilters({ skill })} />
          <Select
            className="candidates-exp"
            aria-label="Minimum experience"
            value={filters.exp === undefined ? "" : String(filters.exp)}
            placeholder="Any experience"
            options={EXPERIENCE_OPTIONS}
            onChange={(event) =>
              setFilters({ exp: event.target.value ? Number(event.target.value) : undefined })
            }
          />
          {hasFilters && (
            <Button variant="ghost" size="sm" leftIcon="x" onClick={clearFilters}>
              Clear
            </Button>
          )}
          <span className="spacer" />
          <SegmentedControl
            size="sm"
            aria-label="Layout"
            options={VIEW_OPTIONS}
            value={view}
            onChange={setView}
          />
        </div>

        <div className="candidates-bulkbar" data-active={selected.size > 0 || undefined}>
          {view === "grid" && rows && rows.length > 0 && (
            <Checkbox
              label="Select page"
              checked={pageSelected === pageIds.length}
              indeterminate={pageSelected > 0 && pageSelected < pageIds.length}
              onChange={() => {
                const ids = new Set(selected.keys());
                const selectAll = pageSelected < pageIds.length;
                for (const id of pageIds) {
                  if (selectAll) ids.add(id);
                  else ids.delete(id);
                }
                selectIds(ids);
              }}
            />
          )}
          <span className="candidates-bulk-status" aria-live="polite">
            {selected.size > 0 ? (
              <>
                <strong>{formatNumber(selected.size)} selected</strong>
                <Button variant="link" size="sm" onClick={() => setSelected(new Map())}>
                  Clear selection
                </Button>
              </>
            ) : (
              <span className="subtle text-sm">
                Newest first. Column sorting reorders this page only. Press <Kbd>/</Kbd> to search.
              </span>
            )}
          </span>
          <span className="spacer" />
          <Button
            size="sm"
            variant="ghost"
            leftIcon="mail"
            disabled={exportRows.length === 0}
            onClick={() => void copyEmails()}
          >
            Copy emails
            <span className="sr-only"> ({exportScope})</span>
          </Button>
          <Button
            size="sm"
            leftIcon="download"
            disabled={exportRows.length === 0}
            onClick={exportCsv}
          >
            Export CSV
            <span className="candidates-bulk-scope"> · {exportScope}</span>
          </Button>
        </div>

        {error && (
          <div className="candidates-error">
            <ErrorNotice error={error} />
          </div>
        )}

        {view === "table" ? (
          <DataTable
            caption="Candidates"
            columns={columns}
            rows={rows}
            getRowId={(candidate) => candidate.id}
            getRowLabel={(candidate) => candidate.full_name}
            loading={isLoading || isFetching}
            skeletonRows={8}
            empty={empty}
            error={error}
            onRetry={() => void refetch()}
            selectable
            selectedIds={new Set(selected.keys())}
            onSelectionChange={selectIds}
            onRowClick={(candidate) => navigate(`/candidates/${candidate.id}`)}
          />
        ) : (
          <CandidateGrid
            rows={rows}
            loading={isLoading}
            // A failed load is explained above; "No candidates yet" would be a false all-clear.
            empty={rows === undefined && error ? null : empty}
            selected={selected}
            onToggle={toggleOne}
            highlight={highlight}
          />
        )}

        {data && data.total > 0 && (
          <div className="candidates-footer">
            <Pagination
              total={data.total}
              limit={filters.limit}
              offset={filters.offset}
              onChange={(offset) => setFilters({ offset })}
              pageSizeOptions={PAGE_SIZES}
              onLimitChange={(limit) => setFilters({ limit })}
              noun="candidates"
            />
          </div>
        )}
      </Card>
    </div>
  );
}

function CandidateGrid({
  rows,
  loading,
  empty,
  selected,
  onToggle,
  highlight,
}: {
  rows: readonly Candidate[] | undefined;
  loading: boolean;
  empty: ReactNode;
  selected: ReadonlyMap<string, Candidate>;
  onToggle: (id: string) => void;
  highlight?: readonly string[];
}) {
  if (loading && !rows) {
    return (
      <div className="candidates-grid" aria-busy="true">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="candidates-card">
            <div className="candidates-card-head">
              <Skeleton circle width="2.5rem" height="2.5rem" />
              <div className="candidates-card-identity">
                <Skeleton width="60%" />
                <Skeleton width="80%" />
              </div>
            </div>
            <SkeletonText lines={2} />
          </div>
        ))}
      </div>
    );
  }
  if (!rows || rows.length === 0) return <div className="candidates-grid-empty">{empty}</div>;
  return (
    <div className="candidates-grid">
      {rows.map((candidate) => (
        <CandidateCard
          key={candidate.id}
          candidate={candidate}
          selected={selected.has(candidate.id)}
          onToggle={() => onToggle(candidate.id)}
          highlight={highlight}
        />
      ))}
    </div>
  );
}

/** Candidates register themselves, so the way to get more is to share the sign-up page. */
function SignUpLinkButton() {
  const toast = useToast();
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/register`);
      toast.success("Sign-up link copied");
    } catch {
      toast.error("Could not reach the clipboard");
    }
  }
  return (
    <Button leftIcon="link" onClick={() => void copy()}>
      Copy sign-up link
    </Button>
  );
}
