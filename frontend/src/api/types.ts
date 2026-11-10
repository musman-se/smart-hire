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
export type CandidateRegistration = Schemas["CandidateRegistration"];
export type CandidateUpdate = Schemas["CandidateUpdate"];

export type User = Schemas["UserRead"];
export type Role = Schemas["Role"];
export type LoginRequest = Schemas["LoginRequest"];
export type TokenPair = Schemas["TokenPair"];

/** The hiring team, as the admin's team page lists it. */
export type StaffMember = Schemas["StaffMemberRead"];
export type StaffStatus = Schemas["StaffStatus"];
export type RecruiterInvite = Schemas["RecruiterInvite"];
export type RecruiterInvited = Schemas["RecruiterInvited"];
export type InvitationIssued = Schemas["InvitationIssued"];
export type InvitationPreview = Schemas["InvitationPreview"];
/** A recruiter's (or admin's) own profile: the name and title they go by. */
export type RecruiterProfile = Schemas["RecruiterRead"];
export type RecruiterUpdate = Schemas["RecruiterUpdate"];

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

/**
 * `list`, unchanged — but it compiles only if it names every member of `Union`. A
 * value the backend adds to an enum then fails the build here (the next
 * `generate:api` brings it in), instead of becoming a status no tab, filter or count
 * ever offers. The error names what is missing.
 */
function everyOf<Union extends string>() {
  return <const List extends readonly Union[]>(
    list: List & ([Exclude<Union, List[number]>] extends [never] ? unknown : { missing: Exclude<Union, List[number]> }),
  ): List => list;
}

export const JOB_STATUSES = everyOf<JobStatus>()([
  "draft",
  "processing",
  "published",
  "publish_failed",
  "closed",
]);

export const APPLICATION_STAGES = everyOf<ApplicationStage>()([
  "applied",
  "screening",
  "interview",
  "offer",
  "hired",
  "rejected",
  "withdrawn",
]);

/** Mirrors ApplicationStage.terminal() — these stop counting toward the limit. */
export const TERMINAL_STAGES: ReadonlySet<ApplicationStage> = new Set([
  "hired",
  "rejected",
  "withdrawn",
]);

/** The forward path of an application, in order. Rejected and withdrawn leave it. */
export const PIPELINE_STAGES = [
  "applied",
  "screening",
  "interview",
  "offer",
  "hired",
] as const satisfies readonly ApplicationStage[];

/**
 * Mirrors the backend's MAX_APPLICATIONS_PER_CANDIDATE default (app/core/config.py):
 * how many non-terminal applications a candidate may hold at once. The server reads
 * it from the environment, so a deployment can differ — the UI uses this only to show
 * progress toward the cap; the application_limit_reached error remains the authority.
 */
export const MAX_ACTIVE_APPLICATIONS = 10;

/** Text limits from the backend's application schemas, so the forms stop where it would. */
export const COVER_LETTER_MAX_LENGTH = 5000;
export const STAGE_NOTE_MAX_LENGTH = 1000;

export const EMPLOYMENT_TYPES = everyOf<EmploymentType>()([
  "full_time",
  "part_time",
  "contract",
  "internship",
]);

/** Mirrors the backend's cap on a skill list — a job's required_skills and a
 * candidate's skills alike (MAX_SKILLS in app/skills/schemas.py). */
export const MAX_SKILLS = 50;

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
