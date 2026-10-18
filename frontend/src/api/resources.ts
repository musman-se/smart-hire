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
  JobContent,
  JobCreate,
  JobStatus,
  JobUpdate,
  Notification,
  Page,
  Publication,
  StageChange,
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
  create: (payload: JobCreate, idempotencyKey?: string) =>
    api.post<Job>("/jobs", payload, { idempotencyKey }),
  update: (id: string, payload: JobUpdate) => api.patch<Job>(`/jobs/${id}`, payload),
  remove: (id: string) => api.delete<void>(`/jobs/${id}`),
  /** 202: answers at once with the job in `processing`; the workflow finishes it. */
  publish: (id: string) => api.post<Job>(`/jobs/${id}/publish`),
  publication: (id: string) => api.get<Publication>(`/jobs/${id}/publication`),
  content: (id: string) => api.get<JobContent>(`/jobs/${id}/content`),
  close: (id: string) => api.post<Job>(`/jobs/${id}/close`),
  reopen: (id: string) => api.post<Job>(`/jobs/${id}/reopen`),
};

export const candidatesApi = {
  list: (filters: CandidateFilters) =>
    api.get<Page<Candidate>>(`/candidates${toQuery({ ...filters })}`),
  get: (id: string) => api.get<Candidate>(`/candidates/${id}`),
  create: (payload: CandidateCreate, idempotencyKey?: string) =>
    api.post<Candidate>("/candidates", payload, { idempotencyKey }),
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
  apply: (jobId: string, payload: ApplicationCreate, idempotencyKey?: string) =>
    api.post<Application>(`/jobs/${jobId}/applications`, payload, { idempotencyKey }),
  advance: (id: string, stage: ApplicationStage, note?: string) =>
    api.post<Application>(`/applications/${id}/stage`, { stage, note: note || null }),
  /** Not a delete: the application moves to `withdrawn` and keeps its history. */
  withdraw: (id: string) => api.delete<void>(`/applications/${id}`),
  history: (id: string) => api.get<StageChange[]>(`/applications/${id}/history`),
  notifications: (id: string) => api.get<Notification[]>(`/applications/${id}/notifications`),
  process: (id: string) => api.post<Application>(`/applications/${id}/process`),
};

export interface Readiness {
  status: "ok" | "degraded";
  database?: string;
  temporal?: string;
  redis?: string;
}

export const healthApi = {
  ready: () => api.get<Readiness>("/health/ready"),
};
