/**
 * TanStack Query hooks.
 *
 * Server state is not component state: it is a cache of something owned elsewhere, which
 * can go stale. Query handles the caching, the loading and error states, and — the part
 * that matters most here — invalidation. Publishing a job invalidates the job lists, so
 * every table showing that job refetches without any of them knowing about each other.
 */

import {
  hashKey,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";

import {
  MAX_IDS_PER_REQUEST,
  applicationsApi,
  authApi,
  candidatesApi,
  healthApi,
  jobsApi,
  recruitersApi,
  skillsApi,
  type ApplicationFilters,
  type CandidateFilters,
  type JobFilters,
} from "../api/resources";
import {
  APPLICATION_STAGES,
  JOB_STATUSES,
  type Application,
  type ApplicationCreate,
  type ApplicationStage,
  type Candidate,
  type CandidateUpdate,
  type Job,
  type JobCreate,
  type JobUpdate,
  type RecruiterUpdate,
} from "../api/types";
import { session } from "../auth/session";
import { scorePollInterval } from "../components/applications/stages";

/** Centralised keys so an invalidation cannot miss a cache by mistyping a string. */
export const keys = {
  jobs: ["jobs"] as const,
  jobList: (filters: JobFilters) => ["jobs", "list", filters] as const,
  job: (id: string) => ["jobs", "detail", id] as const,
  // Under the "jobs" prefix, so invalidating jobs refreshes these too.
  // Keyed by the job's status too, so the workflow's state is re-read the moment the
  // job's changes — otherwise the last poll ("running") outlived the run.
  publication: (id: string, status: string) => ["jobs", "publication", id, status] as const,
  content: (id: string, processedAt: string | null | undefined) =>
    ["jobs", "content", id, processedAt] as const,
  /** Every status's total, in one read. Under "jobs", so any job change refreshes it. */
  jobStatusCounts: ["jobs", "count"] as const,

  candidates: ["candidates"] as const,
  candidateList: (filters: CandidateFilters) => ["candidates", "list", filters] as const,
  candidate: (id: string) => ["candidates", "detail", id] as const,
  /** One batch of candidates by id; `ids` sorted, so the order asked in does not matter. */
  candidateBatch: (ids: readonly string[]) => ["candidates", "batch", ids] as const,

  applications: ["applications"] as const,
  applicationList: (filters: ApplicationFilters) => ["applications", "list", filters] as const,
  application: (id: string) => ["applications", "detail", id] as const,
  /** Every stage's total, optionally for one job. */
  stageCounts: (jobId?: string) => ["applications", "count", jobId ?? null] as const,
  /** Applications received per job, for a sorted list of jobs. */
  jobIntake: (jobIds: readonly string[]) => ["applications", "intake", jobIds] as const,
  jobApplications: (jobId: string) => ["applications", "job", jobId] as const,
  candidateApplications: (candidateId: string) =>
    ["applications", "candidate", candidateId] as const,
  history: (applicationId: string) => ["applications", "history", applicationId] as const,
  notifications: (applicationId: string) =>
    ["applications", "notifications", applicationId] as const,

  skills: (search: string) => ["skills", search.trim().toLowerCase()] as const,

  recruiterProfile: ["recruiters", "me"] as const,

  /** The admin's team page. */
  team: ["team"] as const,
  teamList: (filters: { limit: number; offset: number }) => ["team", "list", filters] as const,

  readiness: ["health", "ready"] as const,
};

// --- Jobs ------------------------------------------------------------------------

export function useJobs(filters: JobFilters, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: keys.jobList(filters),
    queryFn: () => jobsApi.list(filters),
    // Keeps the previous page visible while the next one loads, instead of flashing
    // an empty table on every filter change.
    placeholderData: (previous) => previous,
    enabled,
  });
}

/** Publishing is asynchronous, so while a job is `processing` it is re-fetched every
 * second until the workflow moves it on. */
export function useJob(id: string) {
  return useQuery({
    queryKey: keys.job(id),
    queryFn: () => jobsApi.get(id),
    refetchInterval: (query) => (query.state.data?.status === "processing" ? 1000 : false),
  });
}

/**
 * The workflow's own view: live step while running, final status after. Polled while
 * the job is processing, and while any run is still going — a re-analysis of a live
 * job leaves it "published" throughout, so the job's status alone would never poll.
 * When the publication shows a newer analysis or failure than the job in hand, the job
 * is re-read too, so its stale-analysis notice clears or appears without a reload.
 */
export function useJobPublication(
  job: Pick<Job, "id" | "status" | "content_processed_at" | "publish_error">,
) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: keys.publication(job.id, job.status),
    queryFn: () => jobsApi.publication(job.id),
    refetchInterval: (current) =>
      job.status === "processing" || current.state.data?.workflow?.status === "running" ? 1000 : false,
  });
  const latest = query.data;
  const jobBehind =
    latest !== undefined &&
    latest.job_status === job.status &&
    (latest.content_processed_at !== job.content_processed_at || latest.publish_error !== job.publish_error);
  useEffect(() => {
    if (jobBehind) void client.invalidateQueries({ queryKey: keys.job(job.id), exact: true });
  }, [jobBehind, client, job.id]);
  return query;
}

/** Keyed by processed_at, so the panel refetches exactly when a run finishes. */
export function useJobContent(id: string, processedAt: string | null | undefined) {
  return useQuery({
    queryKey: keys.content(id, processedAt),
    queryFn: () => jobsApi.content(id),
    enabled: Boolean(processedAt),
  });
}

export function useCreateJob() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ payload, idempotencyKey }: { payload: JobCreate; idempotencyKey: string }) =>
      jobsApi.create(payload, idempotencyKey),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.jobs }),
  });
}

export function useUpdateJob(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: JobUpdate) => jobsApi.update(id, payload),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.jobs }),
  });
}

/** publish / close / reopen share a shape, so they share a hook. */
export function useJobTransition(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (action: "publish" | "close" | "reopen") => jobsApi[action](id),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.jobs }),
  });
}

export function useDeleteJob() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => jobsApi.remove(id),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: keys.jobs });
      // Applications cascade server-side, so their caches are stale too.
      client.invalidateQueries({ queryKey: keys.applications });
    },
  });
}

/**
 * Totals keyed by enum value, for counts on tabs and dashboards. Every value is a key,
 * `undefined` until the answer arrives, so callers can tell "not loaded" from 0.
 */
function countsSummary<K extends string>(
  values: readonly K[],
  query: { data: Partial<Record<K, number>> | undefined; isLoading: boolean; isError: boolean },
) {
  const { data } = query;
  return {
    counts: Object.fromEntries(values.map((value) => [value, data?.[value]])) as Record<
      K,
      number | undefined
    >,
    total: values.reduce((sum, value) => sum + (data?.[value] ?? 0), 0),
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

/** Totals per job status, every status in one request. Recruiters only — a candidate's
 * list is published jobs. */
export function useJobStatusCounts({ enabled = true }: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: keys.jobStatusCounts,
    queryFn: () => jobsApi.statusCounts(),
    enabled,
  });
  const { data, isLoading, isError } = query;
  return useMemo(
    () => countsSummary(JOB_STATUSES, { data, isLoading, isError }),
    [data, isLoading, isError],
  );
}

/**
 * Many entities by id, each under its own detail key — so a job fetched here is the
 * same cache entry useJob(id) reads, and vice versa. For lists of applications that
 * need job titles: pass the ids on the current page. (Candidates have a batch endpoint;
 * see useCandidatesByIds.)
 *
 * Ids the caller may not read (a candidate asking for a closed job, say) are simply
 * absent from the map; render a fallback for them.
 */
function useEntitiesByIds<T extends { id: string }>(
  ids: readonly string[],
  queryKey: (id: string) => readonly unknown[],
  fetchOne: (id: string) => Promise<T>,
) {
  const unique = [...new Set(ids)].filter(Boolean);
  const { data, isLoading } = useQueries({
    queries: unique.map((id) => ({
      queryKey: queryKey(id),
      queryFn: () => fetchOne(id),
      staleTime: 60_000,
    })),
    combine: combineData<T>,
  });
  const byId = useMemo(() => {
    const map = new Map<string, T>();
    for (const entity of data) {
      if (entity) map.set(entity.id, entity);
    }
    return map;
  }, [data]);
  return { byId, isLoading };
}

/**
 * The data of several queries, for building a lookup in a memo. Query structurally
 * shares a combined result only when it is plain objects and arrays — a Map built in
 * `combine` would be new on every render, and so would everything memoised on it. Kept
 * at module level so the combine is not re-run on every render either.
 */
export function combineData<T>(results: readonly { data: T | undefined; isLoading: boolean }[]) {
  return {
    data: results.map((result) => result.data),
    isLoading: results.some((result) => result.isLoading),
  };
}

export function useJobsByIds(ids: readonly string[]) {
  return useEntitiesByIds<Job>(ids, keys.job, jobsApi.get);
}

// --- Candidates ------------------------------------------------------------------

export function useCandidates(filters: CandidateFilters) {
  return useQuery({
    queryKey: keys.candidateList(filters),
    queryFn: () => candidatesApi.list(filters),
    placeholderData: (previous) => previous,
  });
}

export function useCandidate(id: string, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: keys.candidate(id),
    queryFn: () => candidatesApi.get(id),
    enabled: enabled && Boolean(id),
  });
}

/** Splits `items` into runs of at most `size`. */
function chunked<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
}

/**
 * Many candidates by id — the applicants on a board or a page of the queue — in one
 * `GET /candidates?ids=…` per hundred rather than one request each. Every profile read
 * is also written to its own detail key, so a drawer or page opened next reads
 * useCandidate's cache instead of asking again. Recruiters only.
 */
export function useCandidatesByIds(ids: readonly string[]) {
  const client = useQueryClient();
  const signature = [...new Set(ids)].filter(Boolean).sort().join(",");
  const batches = useMemo(
    () => (signature ? chunked(signature.split(","), MAX_IDS_PER_REQUEST) : []),
    [signature],
  );
  const { data, isLoading } = useQueries({
    queries: batches.map((batch) => ({
      queryKey: keys.candidateBatch(batch),
      queryFn: async () => {
        const page = await candidatesApi.list({ ids: batch, limit: batch.length });
        for (const candidate of page.items) client.setQueryData(keys.candidate(candidate.id), candidate);
        return page.items;
      },
      staleTime: 60_000,
    })),
    combine: combineData<Candidate[]>,
  });
  const byId = useMemo(() => {
    const map = new Map<string, Candidate>();
    for (const batch of data) {
      for (const candidate of batch ?? []) map.set(candidate.id, candidate);
    }
    return map;
  }, [data]);
  return { byId, isLoading };
}

/**
 * Invalidates everything under `prefix` except the entry just written from the
 * server's answer — refetching that one at once would only fetch what is already there.
 */
export function invalidateAllBut(client: QueryClient, prefix: QueryKey, written: QueryKey) {
  const skip = hashKey(written);
  return client.invalidateQueries({
    queryKey: prefix,
    predicate: (query) => query.queryHash !== skip,
  });
}

/** A candidate editing their own profile. The answer is the new profile, so it goes
 * straight into the cache instead of waiting on a refetch. */
export function useUpdateCandidate(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: CandidateUpdate) => candidatesApi.update(id, payload),
    onSuccess: (candidate) => {
      client.setQueryData(keys.candidate(id), candidate);
      void invalidateAllBut(client, keys.candidates, keys.candidate(id));
    },
  });
}

// --- Account ---------------------------------------------------------------------

/** The signed-in recruiter's own profile — their name and title. Staff only: a
 * candidate's profile is useCandidate(user.id). */
export function useRecruiterProfile({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: keys.recruiterProfile,
    queryFn: () => recruitersApi.me(),
    enabled,
    // Only its owner changes it, and the update below writes the answer back.
    staleTime: 5 * 60_000,
  });
}

export function useUpdateRecruiterProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: RecruiterUpdate) => recruitersApi.updateMe(payload),
    onSuccess: (profile) => {
      client.setQueryData(keys.recruiterProfile, profile);
      // The admin's team page lists names too.
      void client.invalidateQueries({ queryKey: keys.team });
    },
  });
}

/** The API ends every session, this tab's included, and answers with a new pair:
 * stored at once, so the next request is signed with it and the old refresh token,
 * now unknown to the server, is never presented. */
export function useChangePassword() {
  return useMutation({
    mutationFn: ({ current, next }: { current: string; next: string }) =>
      authApi.changePassword(current, next),
    onSuccess: (tokens) => session.store(tokens),
  });
}

// --- Skills ----------------------------------------------------------------------

const SKILL_SUGGESTION_LIMIT = 8;
/** The vocabulary changes when jobs are published — rarely. */
const SKILLS_STALE_MS = 5 * 60_000;

function fetchSkillNames(search: string): Promise<string[]> {
  return skillsApi
    .list({ search: search.trim(), limit: SKILL_SUGGESTION_LIMIT })
    .then((page) => page.items.map((skill) => skill.name));
}

/** Plain async lookup, for <TagInput suggest={suggestSkills}> outside React's cache.
 * Inside components prefer useSuggestSkills, which caches per prefix. */
export function suggestSkills(search: string): Promise<string[]> {
  if (!search.trim()) return Promise.resolve([]);
  return fetchSkillNames(search);
}

function cachedSkillNames(client: QueryClient, search: string): Promise<string[]> {
  if (!search.trim()) return Promise.resolve([]);
  return client.fetchQuery({
    queryKey: keys.skills(search),
    queryFn: () => fetchSkillNames(search),
    staleTime: SKILLS_STALE_MS,
  });
}

/** A stable `suggest` function for TagInput, cached per prefix: typing "py", deleting
 * it and typing it again costs one request. */
export function useSuggestSkills(): (search: string) => Promise<string[]> {
  const client = useQueryClient();
  return useCallback((search: string) => cachedSkillNames(client, search), [client]);
}

/** The vocabulary as a query, for showing matches outside a TagInput. */
export function useSkillSuggestions(search: string) {
  return useQuery({
    queryKey: keys.skills(search),
    queryFn: () => fetchSkillNames(search),
    enabled: search.trim().length > 0,
    staleTime: SKILLS_STALE_MS,
    placeholderData: (previous) => previous,
  });
}

// --- Applications ----------------------------------------------------------------

/** Scores arrive a moment after the application, from the ProcessApplication
 * workflow. Poll while an active application is younger than SCORE_WAIT_MS and still
 * unscored. Bounded per application rather than by a lifetime counter — a counter ran
 * out once and then never polled again, however many applications came later. An
 * older unscored application means processing never ran; "Re-run scoring" is the way
 * to recover it. */
export function useJobApplications(jobId: string) {
  return useQuery({
    queryKey: keys.jobApplications(jobId),
    queryFn: () => applicationsApi.forJob(jobId, { limit: 100 }),
    refetchInterval: (query) => scorePollInterval(query.state.data?.items),
  });
}

/** Any slice of applications: a job's, a candidate's, a stage's — or, for a candidate,
 * simply their own (the server scopes the list). */
export function useApplications(
  filters: ApplicationFilters,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: keys.applicationList(filters),
    queryFn: () => applicationsApi.list(filters),
    placeholderData: (previous) => previous,
    enabled,
  });
}

export function useApplication(id: string) {
  return useQuery({
    queryKey: keys.application(id),
    queryFn: () => applicationsApi.get(id),
    enabled: Boolean(id),
  });
}

/** Totals per stage — a funnel, or tab badges — every stage in one request, across all
 * jobs or for one. Recruiters only. */
export function useStageCounts({
  jobId,
  enabled = true,
}: { jobId?: string; enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: keys.stageCounts(jobId),
    queryFn: () => applicationsApi.stageCounts(jobId),
    enabled,
  });
  const { data, isLoading, isError } = query;
  return useMemo(
    () => countsSummary(APPLICATION_STAGES, { data, isLoading, isError }),
    [data, isLoading, isError],
  );
}

/** A recruiter's view of one candidate's applications. Candidates read their own
 * through useMyApplications, so all their screens share one cache entry. */
export function useCandidateApplications(candidateId: string) {
  return useQuery({
    queryKey: keys.candidateApplications(candidateId),
    queryFn: () => applicationsApi.list({ candidate_id: candidateId, limit: 100 }),
  });
}

export function useApplyToJob(jobId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      payload,
      idempotencyKey,
    }: {
      payload: ApplicationCreate;
      idempotencyKey: string;
    }) => applicationsApi.apply(jobId, payload, idempotencyKey),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.applications }),
  });
}

export function useApplicationHistory(applicationId: string, enabled: boolean) {
  return useQuery({
    queryKey: keys.history(applicationId),
    queryFn: () => applicationsApi.history(applicationId),
    enabled,
  });
}

export function useApplicationNotifications(applicationId: string, enabled: boolean) {
  return useQuery({
    queryKey: keys.notifications(applicationId),
    queryFn: () => applicationsApi.notifications(applicationId),
    enabled,
  });
}

/** Scoring runs in the worker after the 202, so the lists are re-read a few times as
 * it lands. Once per user action, however many applications it covered: every
 * invalidation cancels and refetches each applications query on the page. */
function scheduleScoreRefresh(client: QueryClient) {
  for (const delay of [0, 1500, 4000]) {
    setTimeout(() => client.invalidateQueries({ queryKey: keys.applications }), delay);
  }
}

/** Re-runs scoring and the confirmation — the recovery path after an outage. */
export function useProcessApplication() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => applicationsApi.process(id),
    onSuccess: () => scheduleScoreRefresh(client),
  });
}

/** The same for many applications at once. Every request settles, and the outcome of
 * each comes back, so the caller can say how many were queued. */
export function useProcessApplications() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (ids: readonly string[]) =>
      Promise.allSettled(ids.map((id) => applicationsApi.process(id))),
    onSuccess: () => scheduleScoreRefresh(client),
  });
}

/** `note` is optional and recruiter-only: it is kept in the stage history, which
 * candidates read without notes. */
export interface AdvanceVariables {
  id: string;
  stage: ApplicationStage;
  note?: string;
  /** Who is being moved, for a message about it — not sent to the server. */
  candidateName?: string;
}

/**
 * `onError` here, at the hook level, runs even if the component that asked has since
 * unmounted — unlike a callback passed to `mutate`, which React Query skips then. For a
 * refusal that must be heard whatever the user did meanwhile.
 */
export function useAdvanceStage({
  onError,
}: { onError?: (error: unknown, variables: AdvanceVariables) => void } = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, stage, note }: AdvanceVariables) => applicationsApi.advance(id, stage, note),
    onSuccess: (application: Application) => {
      client.setQueryData(keys.application(application.id), application);
      void invalidateAllBut(client, keys.applications, keys.application(application.id));
    },
    onError,
  });
}

export function useWithdrawApplication() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => applicationsApi.withdraw(id),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.applications }),
  });
}

// --- Health ----------------------------------------------------------------------

export function useReadiness() {
  return useQuery({
    queryKey: keys.readiness,
    queryFn: () => healthApi.ready(),
    refetchInterval: 15_000,
    retry: false,
  });
}
