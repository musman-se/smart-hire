/**
 * The hiring board's rules, kept free of React so they can be tested on their own:
 * which column an application sits in, where it may be dropped, and how a column is
 * filtered and ordered. The server still owns every rule here — these only decide what
 * the UI offers.
 */

import {
  APPLICATION_STAGES,
  PIPELINE_STAGES,
  type Application,
  type ApplicationStage,
  type Candidate,
  type Page,
} from "../../api/types";
import { humanize } from "../../lib/format";
import { recruiterTargets } from "../applications/stages";

/** The forward stages, then one lane for everything that left the pipeline. */
export type BoardColumn = (typeof PIPELINE_STAGES)[number] | "closed";
export const BOARD_COLUMNS: readonly BoardColumn[] = [...PIPELINE_STAGES, "closed"];

export function columnOf(stage: ApplicationStage): BoardColumn {
  return stage === "rejected" || stage === "withdrawn" ? "closed" : stage;
}

/** What a drop on a column means. The closed lane takes rejections only. */
export function stageForColumn(column: BoardColumn): ApplicationStage {
  return column === "closed" ? "rejected" : column;
}

export function canDrop(from: ApplicationStage, column: BoardColumn): boolean {
  return recruiterTargets(from).includes(stageForColumn(column));
}

export function groupByColumn(applications: readonly Application[]): Record<BoardColumn, Application[]> {
  const groups = Object.fromEntries(BOARD_COLUMNS.map((column) => [column, []])) as unknown as Record<
    BoardColumn,
    Application[]
  >;
  for (const application of applications) groups[columnOf(application.stage)].push(application);
  return groups;
}

export function countByStage(applications: readonly Application[]): Record<ApplicationStage, number> {
  const counts = Object.fromEntries(APPLICATION_STAGES.map((stage) => [stage, 0])) as Record<
    ApplicationStage,
    number
  >;
  for (const application of applications) counts[application.stage] += 1;
  return counts;
}

export interface ApplicantFilters {
  /** Matched against the candidate's name, email and headline. */
  search: string;
  /** 0 means "any". Above 0, unscored applications are hidden: they have no score to
   * clear the bar with. */
  minScore: number;
}

export function matchesFilters(
  application: Application,
  candidate: Candidate | undefined,
  { search, minScore }: ApplicantFilters,
): boolean {
  if (minScore > 0 && (application.match_score ?? -1) < minScore) return false;

  const query = search.trim().toLowerCase();
  if (!query) return true;
  const haystack = [candidate?.full_name, candidate?.email, candidate?.headline]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

export const BOARD_SORTS = ["score", "newest", "oldest"] as const;
export type BoardSort = (typeof BOARD_SORTS)[number];

const createdAt = (application: Application) => Date.parse(application.created_at);

/** Best match first puts unscored applications last, newest first among equals. */
export function sortApplications(applications: readonly Application[], sort: BoardSort): Application[] {
  const sorted = [...applications];
  if (sort === "newest") return sorted.sort((a, b) => createdAt(b) - createdAt(a));
  if (sort === "oldest") return sorted.sort((a, b) => createdAt(a) - createdAt(b));
  return sorted.sort((a, b) => {
    const byScore = (b.match_score ?? -1) - (a.match_score ?? -1);
    return byScore !== 0 ? byScore : createdAt(b) - createdAt(a);
  });
}

/** A page of applications with one moved — the optimistic picture of a stage change. */
export function withStage(
  page: Page<Application>,
  applicationId: string,
  stage: ApplicationStage,
): Page<Application> {
  return {
    ...page,
    items: page.items.map((application) =>
      application.id === applicationId ? { ...application, stage } : application,
    ),
  };
}

/** The sentence announced (and toasted) after a move. */
export function describeMove(name: string, stage: ApplicationStage): string {
  if (stage === "rejected") return `${name} was rejected.`;
  if (stage === "hired") return `${name} was hired.`;
  return `${name} moved to ${humanize(stage)}.`;
}

/** The verb on the button that makes a move: "Move to Interview", "Reject", "Hire". */
export function moveLabel(stage: ApplicationStage): string {
  if (stage === "rejected") return "Reject";
  if (stage === "hired") return "Mark as hired";
  return `Move to ${humanize(stage)}`;
}

/** What to call an applicant before (or without) their profile. */
export function applicantName(candidate: Pick<Candidate, "full_name" | "email"> | undefined): string {
  return candidate?.full_name?.trim() || candidate?.email || "This applicant";
}

export interface Board {
  /** What each column shows: filtered, then ordered. */
  columns: Record<BoardColumn, Application[]>;
  /** How many each column holds before filtering — for "3 of 7". */
  totals: Record<BoardColumn, number>;
}

export function buildBoard(
  applications: readonly Application[],
  candidatesById: ReadonlyMap<string, Candidate>,
  filters: ApplicantFilters,
  sort: BoardSort,
): Board {
  const all = groupByColumn(applications);
  const shown = groupByColumn(
    applications.filter((a) => matchesFilters(a, candidatesById.get(a.candidate_id), filters)),
  );
  const columns = {} as Record<BoardColumn, Application[]>;
  const totals = {} as Record<BoardColumn, number>;
  for (const column of BOARD_COLUMNS) {
    columns[column] = sortApplications(shown[column], sort);
    totals[column] = all[column].length;
  }
  return { columns, totals };
}
