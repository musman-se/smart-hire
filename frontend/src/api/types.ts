/**
 * Friendly aliases over the generated OpenAPI schema.
 *
 * `schema.d.ts` is generated from the backend's own /openapi.json by
 * `npm run generate:api`. Nothing in this folder is hand-maintained, which is the point:
 * if the backend renames a field, the next generate makes this project fail to compile
 * rather than fail at runtime in front of a user.
 */

import type { components } from "./schema";

type Schemas = components["schemas"];

export type Job = Schemas["JobRead"];
export type JobCreate = Schemas["JobCreate"];
export type JobUpdate = Schemas["JobUpdate"];
export type JobStatus = Schemas["JobStatus"];

export type Candidate = Schemas["CandidateRead"];
export type CandidateCreate = Schemas["CandidateCreate"];
export type CandidateUpdate = Schemas["CandidateUpdate"];

export type Application = Schemas["ApplicationRead"];
export type ApplicationCreate = Schemas["ApplicationCreate"];
export type ApplicationStage = Schemas["ApplicationStage"];
export type StageChange = Schemas["StageChangeRead"];
export type Notification = Schemas["NotificationRead"];

export type JobContent = Schemas["JobContentRead"];
export type Publication = Schemas["PublicationRead"];
export type Skill = Schemas["SkillRead"];

export type EmploymentType = Schemas["EmploymentType"];

/** The backend's paginated envelope. Generated per-item, so re-declared generically. */
export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export const JOB_STATUSES = [
  "draft",
  "processing",
  "published",
  "publish_failed",
  "closed",
] as const;

export const APPLICATION_STAGES = [
  "applied",
  "screening",
  "interview",
  "offer",
  "hired",
  "rejected",
  "withdrawn",
] as const;

/** Mirrors ApplicationStage.terminal() — these stop counting toward the limit. */
export const TERMINAL_STAGES: ReadonlySet<ApplicationStage> = new Set([
  "hired",
  "rejected",
  "withdrawn",
]);

export const EMPLOYMENT_TYPES = [
  "full_time",
  "part_time",
  "contract",
  "internship",
] as const;

/**
 * Mirrors ALLOWED_TRANSITIONS in the backend's application_service.
 *
 * Duplicated deliberately: the UI uses it to decide which buttons to show, while the
 * server remains the only thing that enforces it. A client-side copy that drifts can
 * only ever show a wrong button — it can never let an illegal transition through.
 */
export const NEXT_STAGES: Record<ApplicationStage, ApplicationStage[]> = {
  applied: ["screening", "rejected", "withdrawn"],
  screening: ["interview", "rejected", "withdrawn"],
  interview: ["offer", "rejected", "withdrawn"],
  offer: ["hired", "rejected", "withdrawn"],
  hired: [],
  rejected: [],
  withdrawn: [],
};
