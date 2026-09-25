/** One function per backend endpoint. No React in here — just typed HTTP. */

import { api, toQuery } from "./client";
import type {
  Application,
  ApplicationCreate,
  ApplicationStage,
  Candidate,
  CandidateCreate,
  CandidateUpdate,
  Job,
  JobCreate,
  JobStatus,
  JobUpdate,
  Page,
} from "./types";

export interface JobFilters {
  status?: JobStatus | "";
  skill?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface CandidateFilters {
  skill?: string;
  search?: string;
  min_experience?: number;
  limit?: number;
  offset?: number;
}

export const jobsApi = {
  list: (filters: JobFilters) => api.get<Page<Job>>(`/jobs${toQuery({ ...filters })}`),
  get: (id: string) => api.get<Job>(`/jobs/${id}`),
  create: (payload: JobCreate) => api.post<Job>("/jobs", payload),
  update: (id: string, payload: JobUpdate) => api.patch<Job>(`/jobs/${id}`, payload),
  remove: (id: string) => api.delete<void>(`/jobs/${id}`),
  publish: (id: string) => api.post<Job>(`/jobs/${id}/publish`),
  close: (id: string) => api.post<Job>(`/jobs/${id}/close`),
  reopen: (id: string) => api.post<Job>(`/jobs/${id}/reopen`),
};

export const candidatesApi = {
  list: (filters: CandidateFilters) =>
    api.get<Page<Candidate>>(`/candidates${toQuery({ ...filters })}`),
  get: (id: string) => api.get<Candidate>(`/candidates/${id}`),
  create: (payload: CandidateCreate) => api.post<Candidate>("/candidates", payload),
  update: (id: string, payload: CandidateUpdate) =>
    api.patch<Candidate>(`/candidates/${id}`, payload),
  remove: (id: string) => api.delete<void>(`/candidates/${id}`),
};

export const applicationsApi = {
  list: (filters: {
    job_id?: string;
    candidate_id?: string;
    stage?: ApplicationStage | "";
    limit?: number;
    offset?: number;
  }) => api.get<Page<Application>>(`/applications${toQuery({ ...filters })}`),
  forJob: (jobId: string, filters: { stage?: ApplicationStage | ""; limit?: number } = {}) =>
    api.get<Page<Application>>(`/jobs/${jobId}/applications${toQuery({ ...filters })}`),
  apply: (jobId: string, payload: ApplicationCreate) =>
    api.post<Application>(`/jobs/${jobId}/applications`, payload),
  advance: (id: string, stage: ApplicationStage) =>
    api.post<Application>(`/applications/${id}/stage`, { stage }),
  withdraw: (id: string) => api.delete<void>(`/applications/${id}`),
};

export interface Readiness {
  status: string;
  database?: string;
}

export const healthApi = {
  ready: () => api.get<Readiness>("/health/ready"),
};
