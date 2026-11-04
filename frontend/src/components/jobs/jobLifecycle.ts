/**
 * Which lifecycle actions a job offers in each status. Mirrors the backend's rules
 * (jobs/service.py, publishing/service.py) so the UI only offers what will succeed; the
 * server still decides, and refuses anything else with job_not_open.
 */

import type { JobStatus } from "../../api/types";
import type { IconName } from "../ui";

export type JobAction = "publish" | "close" | "reopen";

const ACTIONS_BY_STATUS: Record<JobStatus, readonly JobAction[]> = {
  draft: ["publish"],
  publish_failed: ["publish"],
  // Closing mid-publish is allowed: the workflow leaves a closed job closed.
  processing: ["close"],
  published: ["close"],
  // Reopening returns the job to draft, so it is published again from there.
  closed: ["reopen"],
};

export function lifecycleActions(status: JobStatus): readonly JobAction[] {
  return ACTIONS_BY_STATUS[status];
}

/** A closed job must be reopened first, and a processing one is being read by the
 * publishing workflow — the server refuses edits to both. */
export function canEditJob(status: JobStatus): boolean {
  return status !== "closed" && status !== "processing";
}

/** Why Edit is unavailable, shown beside it in a menu; one entry per status canEditJob refuses. */
export const EDIT_BLOCKED_HINT: Partial<Record<JobStatus, string>> = {
  closed: "Reopen first",
  processing: "Publishing…",
};

/** Draft-like jobs can be published from the editor in the same step as saving. */
export function canPublishJob(status: JobStatus): boolean {
  return lifecycleActions(status).includes("publish");
}

export function actionLabel(action: JobAction, status: JobStatus): string {
  if (action === "publish") return status === "publish_failed" ? "Retry publish" : "Publish";
  return action === "close" ? "Close job" : "Reopen";
}

export const ACTION_ICONS: Record<JobAction, IconName> = {
  publish: "send",
  close: "archive",
  reopen: "refresh",
};
