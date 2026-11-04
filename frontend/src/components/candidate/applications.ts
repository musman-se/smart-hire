/**
 * Pure helpers over a candidate's own applications: which count toward the cap and how
 * a list is ordered. No React, so they are tested alone.
 */

import {
  MAX_ACTIVE_APPLICATIONS,
  TERMINAL_STAGES,
  type Application,
} from "../../api/types";

/** Active means it still counts toward the cap — the server's own definition. */
export function isActive(application: Pick<Application, "stage">): boolean {
  return !TERMINAL_STAGES.has(application.stage);
}

export function splitApplications<T extends Pick<Application, "stage">>(applications: readonly T[]) {
  const active: T[] = [];
  const closed: T[] = [];
  for (const application of applications) {
    (isActive(application) ? active : closed).push(application);
  }
  return { active, closed };
}

export type ApplicationSort = "updated" | "applied";

/** Newest first, by last movement or by application date. Returns a new array. */
export function sortApplications<T extends Pick<Application, "created_at" | "updated_at">>(
  applications: readonly T[],
  by: ApplicationSort,
): T[] {
  const field = by === "updated" ? "updated_at" : "created_at";
  return [...applications].sort((a, b) => Date.parse(b[field]) - Date.parse(a[field]));
}

export interface CapState {
  used: number;
  max: number;
  remaining: number;
  /** "ok" with room to spare, "near" with one or two left, "full" at the cap. */
  level: "ok" | "near" | "full";
}

/**
 * Where a candidate stands against the active-applications cap. The client copy of
 * the limit can drift from the server's setting; `application_limit_reached` stays
 * the authority, this only sets expectations.
 */
export function capState(activeCount: number, max: number = MAX_ACTIVE_APPLICATIONS): CapState {
  const remaining = Math.max(0, max - activeCount);
  const level = remaining === 0 ? "full" : remaining <= 2 ? "near" : "ok";
  return { used: activeCount, max, remaining, level };
}
