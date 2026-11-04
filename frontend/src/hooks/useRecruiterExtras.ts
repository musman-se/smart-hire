/**
 * Query hooks for the recruiter's candidate directory and review queue. Built on
 * `keys` from queries.ts, so each list here is the same cache entry the rest of the app
 * reads, and every application mutation still invalidates it by prefix.
 */

import { useQuery } from "@tanstack/react-query";

import { applicationsApi, type ApplicationFilters } from "../api/resources";
import { scorePollInterval } from "../components/applications/stages";
import { keys, useJobs } from "./queries";

/**
 * A page of the review queue. Same key as useApplications, so the two share a cache;
 * this one also polls while a fresh application on the page awaits its score. Polling
 * stops at SCORE_WAIT_MS, the same moment the row turns stalled and offers "Re-run
 * scoring".
 */
export function useApplicationQueue(filters: ApplicationFilters) {
  return useQuery({
    queryKey: keys.applicationList(filters),
    queryFn: () => applicationsApi.list(filters),
    placeholderData: (previous) => previous,
    refetchInterval: (query) => scorePollInterval(query.state.data?.items),
  });
}

/** The API's page cap, and so the most jobs a filter can offer without paging. */
export const RECENT_JOBS_LIMIT = 100;

/** The newest jobs of any status, for "filter by job" pickers. */
export function useRecentJobs() {
  return useJobs({ limit: RECENT_JOBS_LIMIT });
}
