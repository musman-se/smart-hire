/**
 * TanStack Query hooks.
 *
 * Server state is not component state: it is a cache of something owned elsewhere, which
 * can go stale. Query handles the caching, the loading and error states, and — the part
 * that matters most here — invalidation. Publishing a job invalidates the job lists, so
 * every table showing that job refetches without any of them knowing about each other.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  applicationsApi,
  candidatesApi,
  healthApi,
  jobsApi,
  type CandidateFilters,
  type JobFilters,
} from "../api/resources";
import {
  TERMINAL_STAGES,
  type ApplicationCreate,
  type ApplicationStage,
  type CandidateCreate,
  type JobCreate,
  type JobUpdate,
} from "../api/types";

/** Centralised keys so an invalidation cannot miss a cache by mistyping a string. */
export const keys = {
  jobs: ["jobs"] as const,
  jobList: (filters: JobFilters) => ["jobs", "list", filters] as const,
  job: (id: string) => ["jobs", "detail", id] as const,
  // Under the "jobs" prefix, so invalidating jobs refreshes these too.
  publication: (id: string) => ["jobs", "publication", id] as const,
  content: (id: string, processedAt: string | null | undefined) =>
    ["jobs", "content", id, processedAt] as const,

  candidates: ["candidates"] as const,
  candidateList: (filters: CandidateFilters) => ["candidates", "list", filters] as const,
  candidate: (id: string) => ["candidates", "detail", id] as const,

  applications: ["applications"] as const,
  jobApplications: (jobId: string) => ["applications", "job", jobId] as const,
  candidateApplications: (candidateId: string) =>
    ["applications", "candidate", candidateId] as const,
  history: (applicationId: string) => ["applications", "history", applicationId] as const,
  notifications: (applicationId: string) =>
    ["applications", "notifications", applicationId] as const,

  readiness: ["health", "ready"] as const,
};

// --- Jobs ------------------------------------------------------------------------

export function useJobs(filters: JobFilters) {
  return useQuery({
    queryKey: keys.jobList(filters),
    queryFn: () => jobsApi.list(filters),
    // Keeps the previous page visible while the next one loads, instead of flashing
    // an empty table on every filter change.
    placeholderData: (previous) => previous,
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

/** The workflow's own view: live step while running, final status after. */
export function useJobPublication(id: string, processing: boolean) {
  return useQuery({
    queryKey: keys.publication(id),
    queryFn: () => jobsApi.publication(id),
    refetchInterval: processing ? 1000 : false,
  });
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

// --- Candidates ------------------------------------------------------------------

export function useCandidates(filters: CandidateFilters) {
  return useQuery({
    queryKey: keys.candidateList(filters),
    queryFn: () => candidatesApi.list(filters),
    placeholderData: (previous) => previous,
  });
}

export function useCandidate(id: string) {
  return useQuery({ queryKey: keys.candidate(id), queryFn: () => candidatesApi.get(id) });
}

export function useCreateCandidate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: CandidateCreate) => candidatesApi.create(payload),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.candidates }),
  });
}

export function useDeleteCandidate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => candidatesApi.remove(id),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: keys.candidates });
      client.invalidateQueries({ queryKey: keys.applications });
    },
  });
}

// --- Applications ----------------------------------------------------------------

/** Scores arrive a moment after the application, from the ProcessApplication
 * workflow. Poll while an active application is still unscored — but give up after
 * 20 tries, so a stopped worker does not mean polling forever. */
export function useJobApplications(jobId: string) {
  return useQuery({
    queryKey: keys.jobApplications(jobId),
    queryFn: () => applicationsApi.forJob(jobId, { limit: 100 }),
    refetchInterval: (query) => {
      const awaitingScore = query.state.data?.items.some(
        (a) => a.match_score === null && !TERMINAL_STAGES.has(a.stage),
      );
      return awaitingScore && query.state.dataUpdateCount < 20 ? 1500 : false;
    },
  });
}

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

/** Re-runs scoring and the confirmation — the recovery path after an outage. */
export function useProcessApplication() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => applicationsApi.process(id),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.applications }),
  });
}

export function useAdvanceStage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: ApplicationStage }) =>
      applicationsApi.advance(id, stage),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.applications }),
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
