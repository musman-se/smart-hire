/**
 * What each role may see, decided in one place. The API has three roles but the
 * console has two sides: an admin is a recruiter with one more page (the team), so
 * every "is this the hiring side?" question asks isStaff, never `=== "recruiter"`.
 * A screen that checked the role by name would quietly hand an admin the candidate's
 * version of it.
 */

import type { Role } from "../api/types";

/** Who a screen is for. "staff" is the hiring side: recruiters and admins alike. */
export type Audience = "staff" | "admin" | "candidate";

/** The hiring side of the console: jobs, pipelines, every candidate. */
export function isStaff(role: Role): boolean {
  return role === "recruiter" || role === "admin";
}

/** Manages the hiring team as well. */
export function isAdmin(role: Role): boolean {
  return role === "admin";
}

export function canSee(role: Role, audience: Audience): boolean {
  if (audience === "staff") return isStaff(role);
  if (audience === "admin") return isAdmin(role);
  return role === "candidate";
}
