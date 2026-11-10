/**
 * One function per backend endpoint. No React in here — just typed HTTP.
 *
 * Ids go into paths through `seg`, encoded: they come from the URL bar and from
 * storage, and a stray "/" or "?" in one must not reach a different endpoint.
 */

import { ApiError, api, toQuery } from "./client";
import type {
  Application,
  ApplicationCreate,
  ApplicationStage,
  Candidate,
  CandidateRegistration,
  CandidateUpdate,
  InvitationIssued,
  InvitationPreview,
  Job,
  JobContent,
  JobCreate,
  JobStatus,
  JobUpdate,
  Notification,
  Page,
  Publication,
  RecruiterInvite,
  RecruiterInvited,
  RecruiterProfile,
  RecruiterUpdate,
  Skill,
  StaffMember,
  StageChange,
  TokenPair,
  User,
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
  /** Only these candidates (at most 100) — the applicants on one page, say. */
  ids?: readonly string[];
  limit?: number;
  offset?: number;
}

/** The most ids one `ids` or `job_id` list may carry (the API's page cap). */
export const MAX_IDS_PER_REQUEST = 100;

const seg = encodeURIComponent;

/** Register, login, logout and the invitation pair send no access token: they are how
 * one is obtained. */
export const authApi = {
  register: (payload: CandidateRegistration) =>
    api.post<Candidate>("/auth/register", payload, { anonymous: true }),
  login: (email: string, password: string) =>
    api.post<TokenPair>("/auth/login", { email, password }, { anonymous: true }),
  logout: (refreshToken: string) =>
    api.post<void>("/auth/logout", { refresh_token: refreshToken }, { anonymous: true }),
  me: () => api.get<User>("/auth/me"),
  /** Who an invitation link is for. The token goes in the body, never the URL, so it
   * stays out of server and proxy logs. */
  previewInvitation: (token: string) =>
    api.post<InvitationPreview>("/auth/invitations/preview", { token }, { anonymous: true }),
  /** Sets the invited recruiter's password; the pair returned signs them in. */
  acceptInvitation: (token: string, password: string) =>
    api.post<TokenPair>("/auth/invitations/accept", { token, password }, { anonymous: true }),
  /** Ends every session, this one included; the pair returned replaces it. */
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<TokenPair>("/auth/change-password", {
      current_password: currentPassword,
      new_password: newPassword,
    }),
};

export const jobsApi = {
  list: (filters: JobFilters) => api.get<Page<Job>>(`/jobs${toQuery({ ...filters })}`),
  /** Every status, zero included, in one request. Recruiters only. */
  statusCounts: () => api.get<Record<JobStatus, number>>("/jobs/status-counts"),
  get: (id: string) => api.get<Job>(`/jobs/${seg(id)}`),
  create: (payload: JobCreate, idempotencyKey?: string) =>
    api.post<Job>("/jobs", payload, { idempotencyKey }),
  update: (id: string, payload: JobUpdate) => api.patch<Job>(`/jobs/${seg(id)}`, payload),
  remove: (id: string) => api.delete<void>(`/jobs/${seg(id)}`),
  /** 202: answers at once with the job in `processing`; the workflow finishes it. */
  publish: (id: string) => api.post<Job>(`/jobs/${seg(id)}/publish`),
  publication: (id: string) => api.get<Publication>(`/jobs/${seg(id)}/publication`),
  content: (id: string) => api.get<JobContent>(`/jobs/${seg(id)}/content`),
  close: (id: string) => api.post<Job>(`/jobs/${seg(id)}/close`),
  reopen: (id: string) => api.post<Job>(`/jobs/${seg(id)}/reopen`),
};

/** The signed-in recruiter's (or admin's) own profile. */
export const recruitersApi = {
  me: () => api.get<RecruiterProfile>("/recruiters/me"),
  updateMe: (payload: RecruiterUpdate) => api.patch<RecruiterProfile>("/recruiters/me", payload),
};

/** The hiring team. Admins only: the API answers anyone else with 403 `forbidden`. */
export const teamApi = {
  list: (filters: { limit?: number; offset?: number } = {}) =>
    api.get<Page<StaffMember>>(`/recruiters${toQuery({ ...filters })}`),
  /** No password: the answer carries a one-time invitation token instead. */
  invite: (payload: RecruiterInvite) => api.post<RecruiterInvited>("/recruiters", payload),
  /** A fresh link for someone still invited. Any earlier link stops working. */
  reissueInvitation: (id: string) =>
    api.post<InvitationIssued>(`/recruiters/${seg(id)}/invitation`),
  deactivate: (id: string) => api.post<StaffMember>(`/recruiters/${seg(id)}/deactivate`),
  reactivate: (id: string) => api.post<StaffMember>(`/recruiters/${seg(id)}/reactivate`),
};

export const candidatesApi = {
  list: (filters: CandidateFilters) =>
    api.get<Page<Candidate>>(`/candidates${toQuery({ ...filters })}`),
  get: (id: string) => api.get<Candidate>(`/candidates/${seg(id)}`),
  update: (id: string, payload: CandidateUpdate) =>
    api.patch<Candidate>(`/candidates/${seg(id)}`, payload),
};

export interface ApplicationFilters {
  job_id?: string;
  candidate_id?: string;
  stage?: ApplicationStage | "";
  limit?: number;
  offset?: number;
}

export const applicationsApi = {
  list: (filters: ApplicationFilters) =>
    api.get<Page<Application>>(`/applications${toQuery({ ...filters })}`),
  /** Every stage, zero included — across all jobs, or for one. Recruiters only. */
  stageCounts: (jobId?: string) =>
    api.get<Record<ApplicationStage, number>>(
      `/applications/stage-counts${toQuery({ job_id: jobId })}`,
    ),
  /** Applications each job has received in total, whatever their stage, keyed by job
   * id (at most MAX_IDS_PER_REQUEST ids). Recruiters only. */
  jobCounts: (jobIds: readonly string[]) =>
    api.get<Record<string, number>>(`/applications/job-counts${toQuery({ job_id: jobIds })}`),
  get: (id: string) => api.get<Application>(`/applications/${seg(id)}`),
  forJob: (jobId: string, filters: { stage?: ApplicationStage | ""; limit?: number } = {}) =>
    api.get<Page<Application>>(`/jobs/${seg(jobId)}/applications${toQuery({ ...filters })}`),
  apply: (jobId: string, payload: ApplicationCreate, idempotencyKey?: string) =>
    api.post<Application>(`/jobs/${seg(jobId)}/applications`, payload, { idempotencyKey }),
  advance: (id: string, stage: ApplicationStage, note?: string) =>
    api.post<Application>(`/applications/${seg(id)}/stage`, { stage, note: note || null }),
  /** The candidate's own action. Not a delete: the application moves to `withdrawn`
   * and keeps its history. */
  withdraw: (id: string) => api.delete<void>(`/applications/${seg(id)}`),
  history: (id: string) => api.get<StageChange[]>(`/applications/${seg(id)}/history`),
  notifications: (id: string) =>
    api.get<Notification[]>(`/applications/${seg(id)}/notifications`),
  process: (id: string) => api.post<Application>(`/applications/${seg(id)}/process`),
};

/** The skills vocabulary, for autocomplete. `search` is a prefix match. */
export const skillsApi = {
  list: (filters: { search?: string; limit?: number; offset?: number } = {}) =>
    api.get<Page<Skill>>(`/skills${toQuery({ ...filters })}`),
};

export interface Readiness {
  status: "ok" | "degraded";
  database?: string;
  temporal?: string;
  redis?: string;
}

export const healthApi = {
  /**
   * The API answers 503 when Postgres is down, with the same body as a 200 — which
   * dependency failed. That is a degraded API, not an unreachable one, so the body is
   * read as the answer. A 503 without it (a proxy with no API behind it) stays an error.
   */
  ready: async () => {
    const readiness = await api.get<Partial<Readiness>>("/health/ready", { acceptStatus: [503] });
    if (readiness.status !== "ok" && readiness.status !== "degraded") {
      throw new ApiError(503, "unavailable", "The API is not ready.");
    }
    return readiness as Readiness;
  },
};
