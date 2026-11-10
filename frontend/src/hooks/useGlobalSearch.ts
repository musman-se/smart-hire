/**
 * Live search behind the command palette: jobs by title for everyone (the server
 * returns only published jobs to candidates), candidates by name for recruiters.
 *
 * The keys are the list keys from queries.ts, so a search the palette ran is already
 * cached when the jobs or candidates page asks for the same thing, and any job or
 * candidate mutation invalidates it.
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { candidatesApi, jobsApi } from "../api/resources";
import type { Candidate, Job, Page } from "../api/types";
import { useUser } from "../auth/AuthProvider";
import { isStaff } from "../auth/roles";
import { keys } from "./queries";
import { useDebouncedValue } from "./useDebouncedValue";

/** One letter matches half the database; two is where a title search starts to mean something. */
export const MIN_SEARCH_LENGTH = 2;
/** A palette is for jumping, not browsing: a few hits, plus a link to the full list. */
export const SEARCH_RESULT_LIMIT = 5;
const SEARCH_DEBOUNCE_MS = 200;
/** Re-opening the palette and retyping a search should not refetch it. */
const SEARCH_STALE_MS = 30_000;

export interface SearchSection<T> {
  /** False when this section does not apply: query too short, or not this role's. */
  enabled: boolean;
  items: T[];
  total: number;
  /** Waiting on the debounce or the request; earlier results stay visible meanwhile. */
  loading: boolean;
  error: unknown;
}

export interface GlobalSearch {
  /** The settled search term the results belong to. */
  term: string;
  jobs: SearchSection<Job>;
  candidates: SearchSection<Candidate>;
}

interface QueryState<T> {
  data: Page<T> | undefined;
  isFetching: boolean;
  error: unknown;
}

/** Memoised, so the palette's item list rebuilds only when a result actually changes. */
function useSection<T>(
  enabled: boolean,
  settling: boolean,
  { data, isFetching, error }: QueryState<T>,
): SearchSection<T> {
  return useMemo(
    () => ({
      enabled,
      items: enabled ? (data?.items ?? []) : [],
      total: enabled ? (data?.total ?? 0) : 0,
      loading: enabled && (settling || isFetching),
      error: enabled ? error : null,
    }),
    [enabled, settling, data, isFetching, error],
  );
}

export function useGlobalSearch(query: string): GlobalSearch {
  const user = useUser();
  const typed = query.trim();
  const term = useDebouncedValue(typed, SEARCH_DEBOUNCE_MS);
  const settling = typed !== term;

  const searchJobs = typed.length >= MIN_SEARCH_LENGTH;
  const searchCandidates = searchJobs && isStaff(user.role);
  // The settled term can lag behind a query that just became long enough.
  const termReady = term.length >= MIN_SEARCH_LENGTH;
  const filters = { search: term, limit: SEARCH_RESULT_LIMIT };

  const jobs = useQuery({
    queryKey: keys.jobList(filters),
    queryFn: () => jobsApi.list(filters),
    enabled: searchJobs && termReady,
    placeholderData: (previous) => previous,
    staleTime: SEARCH_STALE_MS,
  });

  const candidates = useQuery({
    queryKey: keys.candidateList(filters),
    queryFn: () => candidatesApi.list(filters),
    enabled: searchCandidates && termReady,
    placeholderData: (previous) => previous,
    staleTime: SEARCH_STALE_MS,
  });

  return {
    term,
    jobs: useSection(searchJobs, settling, jobs),
    candidates: useSection(searchCandidates, settling, candidates),
  };
}
