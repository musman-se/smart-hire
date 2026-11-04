/**
 * Query hooks for the candidate's own screens. Built on `keys` from queries.ts, so
 * each history or job read here is the same cache entry the rest of the app uses, and
 * every application mutation still invalidates them by prefix.
 */

import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";

import { applicationsApi } from "../api/resources";
import type { Notification, StageChange } from "../api/types";
import { combineData, keys, useApplications, useJobs } from "./queries";

/** The API's page cap. A candidate rarely has more; the pages say so when they do. */
export const MY_APPLICATIONS_LIMIT = 100;

/**
 * All of the signed-in candidate's applications (the server scopes the list). Every
 * candidate screen reads this one cache entry, so the active count agrees between
 * pages and a move between them costs no request. useCandidateApplications is the
 * recruiter's view of someone else's.
 */
export function useMyApplications() {
  return useApplications({ limit: MY_APPLICATIONS_LIMIT });
}

/** The newest published jobs, for recommendations. Ranking is client-side, so it can
 * only rank what this one page returns. */
export const OPEN_JOBS_LIMIT = 100;

export function useOpenJobs() {
  return useJobs({ status: "published", limit: OPEN_JOBS_LIMIT });
}

/** One read per application, combined into a map by id. Callers pass a bounded set
 * — the visible page, the ten most recent — never a whole list — and memoise it, so
 * the map keeps its identity between renders. */
function usePerApplication<T>(
  applicationIds: readonly string[],
  queryKey: (id: string) => readonly unknown[],
  fetchOne: (id: string) => Promise<T>,
) {
  const { data, isLoading } = useQueries({
    queries: applicationIds.map((id) => ({ queryKey: queryKey(id), queryFn: () => fetchOne(id) })),
    combine: combineData<T>,
  });
  const byId = useMemo(() => {
    const map = new Map<string, T>();
    data.forEach((entry, index) => {
      const id = applicationIds[index];
      if (id && entry) map.set(id, entry);
    });
    return map;
  }, [data, applicationIds]);
  return { byId, isLoading };
}

export function useHistories(applicationIds: readonly string[]) {
  return usePerApplication<StageChange[]>(applicationIds, keys.history, applicationsApi.history);
}

export function useNotificationsFor(applicationIds: readonly string[]) {
  return usePerApplication<Notification[]>(
    applicationIds,
    keys.notifications,
    applicationsApi.notifications,
  );
}
