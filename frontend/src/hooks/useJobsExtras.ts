/**
 * Job hooks the jobs list and editor need beyond queries.ts. Keys come from `keys`, so
 * these share caches with the central hooks and prefix invalidation still reaches them.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { jobsApi, type JobFilters } from "../api/resources";
import { keys } from "./queries";

/** How often a list holding a job mid-publish, and the count of such jobs, re-read. */
const PROCESSING_POLL_MS = 2000;

/**
 * useJobs, plus live status. While any job on the page is `processing`, the page is
 * re-read until the workflow settles it.
 *
 * The number of `processing` jobs is watched too, across every status, because the
 * page alone cannot see every publish settle: a job published from the Draft tab
 * leaves that list at once. When that number falls, a job has moved tabs, so the
 * per-status counts and the lists behind the other tabs are refreshed.
 */
export function useLiveJobs(filters: JobFilters) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: keys.jobList(filters),
    queryFn: () => jobsApi.list(filters),
    placeholderData: (previous) => previous,
    refetchInterval: (current) =>
      current.state.data?.items.some((job) => job.status === "processing")
        ? PROCESSING_POLL_MS
        : false,
  });

  // The same cache entry the status tabs read (useJobStatusCounts), so polling it
  // also keeps the Processing tab's count current.
  const inFlight = useQuery({
    queryKey: keys.jobStatusCount("processing"),
    queryFn: () => jobsApi.list({ status: "processing", limit: 1 }),
    refetchInterval: (current) => (current.state.data?.total ? PROCESSING_POLL_MS : false),
  });

  const processing = inFlight.data?.total;
  const previous = useRef(processing);
  useEffect(() => {
    if (processing !== undefined && previous.current !== undefined && processing < previous.current) {
      void client.invalidateQueries({ queryKey: [...keys.jobs, "count"] });
      void client.invalidateQueries({ queryKey: [...keys.jobs, "list"] });
    }
    previous.current = processing;
  }, [processing, client]);

  return query;
}

/**
 * Publish any job by id. useJobTransition binds its id when called, but "Save &
 * publish" only learns the id once the create has answered.
 */
export function usePublishJob() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => jobsApi.publish(id),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.jobs }),
  });
}
