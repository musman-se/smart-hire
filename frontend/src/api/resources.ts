/** One function per backend endpoint. No React in here — just typed HTTP. */

import { api, toQuery } from "./client";
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
  limit?: number;
  offset?: number;
}

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

/** The hiring team. Admins only: the API answers anyone else with 403 `forbidden`. */
export const teamApi = {
  list: (filters: { limit?: number; offset?: number } = {}) =>
    api.get<Page<StaffMember>>(`/recruiters${toQuery({ ...filters })}`),
  /** No password: the answer carries a one-time invitation token instead. */
  invite: (payload: RecruiterInvite) => api.post<RecruiterInvited>("/recruiters", payload),
  /** A fresh link for someone still invited. Any earlier link stops working. */
  reissueInvitation: (id: string) => api.post<InvitationIssued>(`/recruiters/${id}/invitation`),
  deactivate: (id: string) => api.post<StaffMember>(`/recruiters/${id}/deactivate`),
  reactivate: (id: string) => api.post<StaffMember>(`/recruiters/${id}/reactivate`),
};

export const candidatesApi = {
  list: (filters: CandidateFilters) =>
    api.get<Page<Candidate>>(`/candidates${toQuery({ ...filters })}`),
  get: (id: string) => api.get<Candidate>(`/candidates/${id}`),
  update: (id: string, payload: CandidateUpdate) =>
    api.patch<Candidate>(`/candidates/${id}`, payload),
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
  get: (id: string) => api.get<Application>(`/applications/${id}`),
  forJob: (jobId: string, filters: { stage?: ApplicationStage | ""; limit?: number } = {}) =>
    api.get<Page<Application>>(`/jobs/${jobId}/applications${toQuery({ ...filters })}`),
  apply: (jobId: string, payload: ApplicationCreate, idempotencyKey?: string) =>
    api.post<Application>(`/jobs/${jobId}/applications`, payload, { idempotencyKey }),
  advance: (id: string, stage: ApplicationStage, note?: string) =>
    api.post<Application>(`/applications/${id}/stage`, { stage, note: note || null }),
  /** The candidate's own action. Not a delete: the application moves to `withdrawn`
   * and keeps its history. */
  withdraw: (id: string) => api.delete<void>(`/applications/${id}`),
  history: (id: string) => api.get<StageChange[]>(`/applications/${id}/history`),
  notifications: (id: string) => api.get<Notification[]>(`/applications/${id}/notifications`),
  process: (id: string) => api.post<Application>(`/applications/${id}/process`),
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
  ready: () => api.get<Readiness>("/health/ready"),
};
