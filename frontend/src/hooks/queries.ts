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
import type {
  ApplicationCreate,
  ApplicationStage,
  CandidateCreate,
  JobCreate,
  JobUpdate,
} from "../api/types";

/** Centralised keys so an invalidation cannot miss a cache by mistyping a string. */
export const keys = {
  jobs: ["jobs"] as const,
  jobList: (filters: JobFilters) => ["jobs", "list", filters] as const,
  job: (id: string) => ["jobs", "detail", id] as const,

  candidates: ["candidates"] as const,
  candidateList: (filters: CandidateFilters) => ["candidates", "list", filters] as const,
  candidate: (id: string) => ["candidates", "detail", id] as const,

  applications: ["applications"] as const,
  jobApplications: (jobId: string) => ["applications", "job", jobId] as const,
  candidateApplications: (candidateId: string) =>
    ["applications", "candidate", candidateId] as const,

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

export function useJob(id: string) {
  return useQuery({ queryKey: keys.job(id), queryFn: () => jobsApi.get(id) });
}

export function useCreateJob() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: JobCreate) => jobsApi.create(payload),
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

export function useJobApplications(jobId: string) {
  return useQuery({
    queryKey: keys.jobApplications(jobId),
    queryFn: () => applicationsApi.forJob(jobId, { limit: 100 }),
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
    mutationFn: (payload: ApplicationCreate) => applicationsApi.apply(jobId, payload),
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
