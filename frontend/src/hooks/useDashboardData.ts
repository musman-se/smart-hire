/**
 * Everything the recruiter dashboard reads, in one place.
 *
 * Headline numbers come from the count endpoints (useJobStatusCounts, useStageCounts,
 * one request each), so they are exact. Anything that needs the rows themselves — the trend, activity, top
 * jobs, scores — comes from the newest 100 applications, the most one request returns;
 * `truncated` tells the cards to say so. Every key sits under the jobs or applications
 * prefix, so any mutation elsewhere in the app refreshes the dashboard too.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { applicationsApi, type ApplicationFilters } from "../api/resources";
import type { Job } from "../api/types";
import {
  activeCount,
  attentionItems,
  averageScore,
  awaitingScore,
  buildFunnel,
  busiestJob,
  dailyTrend,
  jobVolumes,
} from "../components/dashboard/metrics";
import { keys, useApplications, useJobStatusCounts, useJobs, useStageCounts } from "./queries";
import { useNow } from "./useNow";

/** The API's page-size ceiling: the largest sample one request can give. */
export const RECENT_LIMIT = 100;
/** Capped jobs checked for capacity — all in one count request, which takes up to 100. */
const CAPACITY_CHECK_LIMIT = 50;
const RECENT_FILTERS: ApplicationFilters = { limit: RECENT_LIMIT };

/** Applications each job has received in total — what its max_applications cap is
 * measured against on the server — in one request for every job. */
function useJobIntake(jobs: readonly Job[]) {
  const ids = useMemo(() => jobs.map((job) => job.id).sort(), [jobs]);
  const { data, isLoading } = useQuery({
    queryKey: keys.jobIntake(ids),
    queryFn: () => applicationsApi.jobCounts(ids),
    enabled: ids.length > 0,
  });
  const intake = useMemo(
    () =>
      jobs.flatMap((job) => {
        const received = data?.[job.id];
        return received === undefined ? [] : [{ job, received }];
      }),
    [jobs, data],
  );
  return { intake, isLoading };
}

export function useDashboardData() {
  const client = useQueryClient();
  const now = useNow();

  const jobCounts = useJobStatusCounts();
  const stageCounts = useStageCounts();

  const recent = useQuery({
    queryKey: keys.applicationList(RECENT_FILTERS),
    queryFn: () => applicationsApi.list(RECENT_FILTERS),
    // Scores land about a second after an application arrives; poll briefly so the
    // activity feed fills them in rather than showing "pending" until a reload.
    refetchInterval: (query) =>
      awaitingScore(query.state.data?.items ?? [], Date.now()) ? 2000 : false,
  });

  // Each list is fetched only when its status count says there is something in it.
  const failedJobs = useJobs(
    { status: "publish_failed", limit: RECENT_LIMIT },
    { enabled: (jobCounts.counts.publish_failed ?? 0) > 0 },
  );
  const processingJobs = useJobs(
    { status: "processing", limit: RECENT_LIMIT },
    { enabled: (jobCounts.counts.processing ?? 0) > 0 },
  );
  const publishedJobs = useJobs(
    { status: "published", limit: RECENT_LIMIT },
    { enabled: (jobCounts.counts.published ?? 0) > 0 },
  );
  const cappedJobs = useMemo(
    () =>
      (publishedJobs.data?.items ?? [])
        .filter((job) => job.max_applications != null)
        .slice(0, CAPACITY_CHECK_LIMIT),
    [publishedJobs.data],
  );
  const intake = useJobIntake(cappedJobs);

  // The list is newest-first, so the oldest waiting applications are its last page.
  const appliedTotal = stageCounts.counts.applied ?? 0;
  const oldestApplied = useApplications(
    { stage: "applied", limit: RECENT_LIMIT, offset: Math.max(0, appliedTotal - RECENT_LIMIT) },
    { enabled: appliedTotal > 0 },
  );

  const applications = useMemo(() => recent.data?.items ?? [], [recent.data]);
  const truncated = (recent.data?.total ?? 0) > applications.length;

  const funnel = useMemo(() => buildFunnel(stageCounts.counts), [stageCounts.counts]);
  const trend = useMemo(
    () => dailyTrend(applications, { now, truncated }),
    [applications, now, truncated],
  );
  const score = useMemo(() => averageScore(applications), [applications]);
  const volumes = useMemo(() => jobVolumes(applications), [applications]);

  const attention = useMemo(
    () =>
      attentionItems({
        failedJobs: failedJobs.data?.items ?? [],
        processingJobs: processingJobs.data?.items ?? [],
        intake: intake.intake,
        recentApplications: applications,
        appliedApplications: oldestApplied.data?.items ?? [],
        now,
      }),
    [failedJobs.data, processingJobs.data, intake.intake, applications, oldestApplied.data, now],
  );

  const refresh = useCallback(
    () =>
      Promise.all([
        client.invalidateQueries({ queryKey: keys.jobs }),
        client.invalidateQueries({ queryKey: keys.applications }),
      ]),
    [client],
  );

  return {
    now,
    jobCounts,
    stageCounts,
    activeApplications: activeCount(stageCounts.counts),
    funnel,
    recent: {
      applications,
      total: recent.data?.total,
      truncated,
      isLoading: recent.isLoading,
      error: recent.error,
      updatedAt: recent.dataUpdatedAt,
    },
    trend,
    score,
    volumes,
    busiest: busiestJob(volumes),
    attention: {
      items: attention,
      // The rules that read rows wait for those rows, so "all clear" is never shown
      // for a check that has not run yet.
      isLoading:
        jobCounts.isLoading ||
        stageCounts.isLoading ||
        recent.isLoading ||
        failedJobs.isLoading ||
        processingJobs.isLoading ||
        publishedJobs.isLoading ||
        intake.isLoading ||
        oldestApplied.isLoading,
      error: failedJobs.error ?? processingJobs.error ?? oldestApplied.error,
    },
    refresh,
  };
}

export type DashboardData = ReturnType<typeof useDashboardData>;
