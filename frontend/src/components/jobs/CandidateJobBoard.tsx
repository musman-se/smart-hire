import { useMemo } from "react";

import { EMPLOYMENT_TYPES, MAX_ACTIVE_APPLICATIONS, type EmploymentType } from "../../api/types";
import { useUser } from "../../auth/AuthProvider";
import { useCandidate, useJobs, useSuggestSkills } from "../../hooks/queries";
import { useMyApplications } from "../../hooks/useCandidateExtras";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { urlParam, useUrlState } from "../../hooks/useUrlState";
import {
  Button,
  ButtonLink,
  Card,
  EmptyState,
  ErrorNotice,
  Input,
  Notice,
  PageHeader,
  Pagination,
  ProgressBar,
  SearchInput,
  SegmentedControl,
  Select,
  Skeleton,
  SkeletonText,
  Switch,
  TagInput,
  cx,
  formatNumber,
  humanize,
  pluralize,
} from "../ui";
import { JobBoardCard, type BoardLayout } from "./JobBoardCard";
import {
  BOARD_SORTS,
  applicationsByJob,
  buildBoard,
  countActive,
  hasBoardFilters,
  type BoardSort,
} from "./jobBoard";
import { useDebouncedUrlText } from "./useDebouncedUrlText";

const BOARD_FILTERS = {
  search: urlParam.string(),
  skill: urlParam.string(),
  type: urlParam.oneOf(EMPLOYMENT_TYPES),
  location: urlParam.string(),
  eligibleOnly: urlParam.boolean(),
  hideApplied: urlParam.boolean(),
  sort: urlParam.oneOf(BOARD_SORTS, "newest"),
  offset: urlParam.number(0, { min: 0 }),
};

/** The API's largest page. Type, location and fit are filtered in the browser, so the
 * board loads as many openings as it can at once for them to work over. */
const BOARD_PAGE_SIZE = 100;

const TYPE_OPTIONS = EMPLOYMENT_TYPES.map((type) => ({ value: type, label: humanize(type) }));

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "match", label: "Best match" },
] as const satisfies readonly { value: BoardSort; label: string }[];

const LAYOUT_OPTIONS = [
  { value: "grid", label: "", icon: "grid", "aria-label": "Grid view" },
  { value: "list", label: "", icon: "list", "aria-label": "List view" },
] as const;

const skillName = (skill: string) => skill.trim().toLowerCase();

/** The candidate's view of /jobs: every published opening, ranked and marked against
 * their own profile and applications. */
export function CandidateJobBoard() {
  useDocumentTitle("Find jobs");
  const user = useUser();
  const [filters, setFilters] = useUrlState(BOARD_FILTERS, { resetOnChange: "offset" });
  const [search, setSearch] = useDebouncedUrlText(filters.search, (value) => setFilters({ search: value }));
  const [location, setLocation] = useDebouncedUrlText(filters.location, (value) =>
    setFilters({ location: value }),
  );
  const [layout, setLayout] = useLocalStorage<BoardLayout>("smarthire.jobs.boardLayout", "grid");
  const suggestSkills = useSuggestSkills();

  const jobs = useJobs({
    search: filters.search,
    skill: filters.skill,
    limit: BOARD_PAGE_SIZE,
    offset: filters.offset,
  });
  const profile = useCandidate(user.id);
  const applications = useMyApplications();

  const applied = useMemo(
    () => applicationsByJob(applications.data?.items ?? []),
    [applications.data],
  );
  // The URL state is shaped as BoardFilters, so it feeds the board logic as it is.
  const entries = useMemo(
    () => buildBoard(jobs.data?.items ?? [], profile.data, applied, filters),
    [jobs.data, profile.data, applied, filters],
  );
  const filtered = hasBoardFilters(filters);
  const clearFilters = () =>
    setFilters({ search: "", skill: "", type: "", location: "", eligibleOnly: false, hideApplied: false });

  const total = jobs.data?.total ?? 0;
  const loaded = jobs.data?.items.length ?? 0;
  const profileHasSkills = (profile.data?.skills?.length ?? 0) > 0;
  const active = applications.data ? countActive(applications.data.items) : undefined;
  const atCap = active !== undefined && active >= MAX_ACTIVE_APPLICATIONS;
  // Anything else in storage (an old or hand-edited value) reads as the default.
  const view: BoardLayout = layout === "list" ? "list" : "grid";

  return (
    <>
      <PageHeader
        title="Find jobs"
        description="Every role open right now. Skills you have are highlighted, and each role says up front whether you can apply."
      />

      <div className="jobs-board-intro">
        <ApplicationAllowance active={active} />
        {profile.data && !profileHasSkills && (
          <Notice
            tone="info"
            title="Add your skills to see how well you match"
            action={
              <ButtonLink to="/profile" size="sm" variant="secondary">
                Update profile
              </ButtonLink>
            }
          >
            Most roles ask for at least one of their listed skills. With your skills on your
            profile, every role here shows your match and ranks by it.
          </Notice>
        )}
        <ErrorNotice error={profile.error} />
        {/* Without them no card can say "Applied", so the board must say why. */}
        <ErrorNotice error={applications.error} />
      </div>

      <section className="jobs-toolbar jobs-board-toolbar" aria-label="Search and filter roles">
        <div className="jobs-toolbar-row">
          <SearchInput
            className="jobs-toolbar-search"
            value={search}
            onValueChange={setSearch}
            placeholder="Search job titles"
            aria-label="Search job titles"
          />
          <TagInput
            className="jobs-skill-filter"
            value={filters.skill ? [filters.skill] : []}
            onChange={(skills) => setFilters({ skill: skills[0] ?? "" })}
            suggest={suggestSkills}
            normalize={skillName}
            maxTags={1}
            placeholder="Skill"
            aria-label="Filter by skill"
          />
          <Select
            className="jobs-toolbar-select"
            value={filters.type}
            onChange={(event) => setFilters({ type: event.target.value as EmploymentType | "" })}
            options={TYPE_OPTIONS}
            placeholder="Any type"
            aria-label="Employment type"
          />
          <Input
            className="jobs-toolbar-location"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder="Location"
            aria-label="Location contains"
          />
        </div>
        <div className="jobs-toolbar-row jobs-toolbar-row-secondary">
          <Switch
            checked={filters.eligibleOnly}
            onCheckedChange={(eligibleOnly) => setFilters({ eligibleOnly })}
            label="Only roles I can apply to"
            disabled={!profile.data}
          />
          <Switch
            checked={filters.hideApplied}
            onCheckedChange={(hideApplied) => setFilters({ hideApplied })}
            label="Hide roles I applied to"
            disabled={!applications.data}
          />
          <span className="spacer" />
          <SegmentedControl
            size="sm"
            options={SORT_OPTIONS}
            value={filters.sort}
            onChange={(sort) => setFilters({ sort })}
            aria-label="Sort roles"
          />
          <SegmentedControl
            size="sm"
            options={LAYOUT_OPTIONS}
            value={view}
            onChange={setLayout}
            aria-label="Layout"
          />
        </div>
      </section>

      <ErrorNotice error={jobs.error} />

      {jobs.data && (
        <p className="jobs-results-line" aria-live="polite">
          {filtered && entries.length !== total
            ? `${formatNumber(entries.length)} of ${pluralize(total, "open role")} match`
            : `${pluralize(total, "open role")}`}
          {filters.sort === "match" && profile.data && " · best match first"}
          {total > loaded && (
            <span className="subtle">
              {" "}
              · Type, location and fit filters and sorting apply to the {formatNumber(loaded)} roles on
              this page
            </span>
          )}
        </p>
      )}

      {jobs.isLoading ? (
        <BoardSkeleton layout={view} />
      ) : !jobs.data ? null : entries.length === 0 ? (
        <Card>
          {filtered ? (
            <EmptyState
              icon="search"
              title="No roles match your filters"
              description="Try a broader title search, another skill, or switch off the fit filters."
              action={
                <Button leftIcon="x" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon="briefcase"
              title="No open roles right now"
              description="New roles are published regularly. Keep your profile current so you can apply the moment one fits."
              action={
                <ButtonLink to="/profile" leftIcon="user">
                  Review your profile
                </ButtonLink>
              }
            />
          )}
        </Card>
      ) : (
        <div
          className={cx("jobs-board", `jobs-board-${view}`, jobs.isPlaceholderData && "is-stale")}
          aria-busy={jobs.isFetching}
        >
          {entries.map((entry) => (
            <JobBoardCard
              key={entry.job.id}
              entry={entry}
              layout={view}
              profileHasSkills={profileHasSkills}
              atCap={atCap}
            />
          ))}
        </div>
      )}

      {jobs.data && total > BOARD_PAGE_SIZE && (
        <Pagination
          total={total}
          limit={BOARD_PAGE_SIZE}
          offset={filters.offset}
          onChange={(offset) => setFilters({ offset })}
          noun="roles"
        />
      )}
    </>
  );
}

/** Progress toward the cap on active applications — the rule a candidate most often
 * runs into without knowing it exists. */
function ApplicationAllowance({ active }: { active: number | undefined }) {
  if (active === undefined) return null;
  const remaining = Math.max(MAX_ACTIVE_APPLICATIONS - active, 0);

  return (
    <Card className="jobs-allowance">
      <div className="jobs-allowance-text">
        <p className="jobs-allowance-title">
          {remaining === 0
            ? "You have reached the active application limit"
            : `You can apply to ${pluralize(remaining, "more role")}`}
        </p>
        <p className="jobs-allowance-hint">
          {remaining === 0
            ? "Withdraw an application, or wait for one to be decided, to apply elsewhere."
            : `Up to ${MAX_ACTIVE_APPLICATIONS} applications can be in progress at once. Decided and withdrawn ones do not count.`}
        </p>
      </div>
      <div className="jobs-allowance-meter">
        <ProgressBar
          value={active}
          max={MAX_ACTIVE_APPLICATIONS}
          label="Active applications"
          valueText={`${active} of ${MAX_ACTIVE_APPLICATIONS}`}
          tone={remaining === 0 ? "warning" : "accent"}
          size="sm"
        />
        <ButtonLink to="/applications" variant="link" size="sm">
          {active} of {MAX_ACTIVE_APPLICATIONS} in progress
        </ButtonLink>
      </div>
    </Card>
  );
}

function BoardSkeleton({ layout }: { layout: BoardLayout }) {
  return (
    <div className={cx("jobs-board", `jobs-board-${layout}`)} aria-busy="true" aria-label="Loading roles">
      {Array.from({ length: 6 }, (_, index) => (
        <Card key={index} className="jobs-card-skeleton">
          <div className="row">
            <Skeleton width={36} height={36} />
            <div className="stack-sm jobs-card-skeleton-text">
              <Skeleton width="60%" height={16} />
              <Skeleton width="35%" height={12} />
            </div>
          </div>
          <SkeletonText lines={2} />
        </Card>
      ))}
    </div>
  );
}
