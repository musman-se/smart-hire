import { ApiError } from "../../api/client";
import type { RecruiterInvite, StaffMember } from "../../api/types";
import {
  FULL_NAME_LIMITS,
  codePointLength,
  looksLikeEmail,
  type FieldErrors,
} from "../auth/validation";
import { formatDate, formatRelative, type BadgeTone } from "../ui";

/** Mirrors RecruiterInvite in backend/app/recruiters/schemas.py. */
export const TEAM_LIMITS = {
  fullNameMin: FULL_NAME_LIMITS.min,
  fullNameMax: FULL_NAME_LIMITS.max,
  titleMax: 100,
} as const;

export interface InviteDraft {
  full_name: string;
  email: string;
  title: string;
}

export type InviteField = keyof InviteDraft;

/** On-screen order: also the order focus visits errors. */
export const INVITE_FIELDS: readonly InviteField[] = ["full_name", "email", "title"];

export const EMPTY_INVITE: InviteDraft = { full_name: "", email: "", title: "" };

export function validateInvite(draft: InviteDraft): FieldErrors<InviteField> {
  const errors: FieldErrors<InviteField> = {};
  const name = codePointLength(draft.full_name.trim());
  if (name === 0) errors.full_name = "Enter their full name";
  else if (name < TEAM_LIMITS.fullNameMin) errors.full_name = `Use at least ${TEAM_LIMITS.fullNameMin} characters`;
  else if (name > TEAM_LIMITS.fullNameMax) errors.full_name = `Use ${TEAM_LIMITS.fullNameMax} characters or fewer`;

  if (!draft.email.trim()) errors.email = "Enter their work email";
  else if (!looksLikeEmail(draft.email)) errors.email = "Enter an email address like name@example.com";

  if (codePointLength(draft.title.trim()) > TEAM_LIMITS.titleMax) {
    errors.title = `Keep it to ${TEAM_LIMITS.titleMax} characters`;
  }
  return errors;
}

/** Trimmed, and a blank title is no title rather than "  ". */
export function toInvitePayload(draft: InviteDraft): RecruiterInvite {
  return {
    full_name: draft.full_name.trim(),
    email: draft.email.trim(),
    title: draft.title.trim() || null,
  };
}

/**
 * The server answers a 422 with "field: what is wrong" for the first problem it found.
 * When the field is one on this form, the message belongs on that field; anything else
 * stays a notice under the form.
 */
export function serverFieldError(error: unknown): { field: InviteField; message: string } | null {
  if (!(error instanceof ApiError) || error.code !== "validation_error") return null;
  const separator = error.message.indexOf(": ");
  if (separator < 0) return null;
  const field = error.message.slice(0, separator) as InviteField;
  if (!INVITE_FIELDS.includes(field)) return null;
  const detail = error.message.slice(separator + 2);
  return { field, message: detail.charAt(0).toUpperCase() + detail.slice(1) };
}

/**
 * The link an admin sends. The token goes after "#": the fragment never leaves the
 * browser — not in the request line, not in a Referer header — so the token stays out
 * of server, proxy and analytics logs. The invite page reads it from there.
 */
export function invitationLink(token: string, origin: string = window.location.origin): string {
  return `${origin}/invite#${token}`;
}

export interface StatusView {
  label: string;
  tone: BadgeTone;
  /** A second line under the chip: when the link expires, since when deactivated. */
  detail?: string;
  /** Invited with no link that still works: the admin needs to send a new one. */
  needsLink?: boolean;
}

/** How a member's status reads on the team page. */
export function describeStatus(member: StaffMember, now: number = Date.now()): StatusView {
  if (member.status === "active") return { label: "Active", tone: "success" };
  if (member.status === "deactivated") {
    return {
      label: "Deactivated",
      tone: "neutral",
      detail: member.deactivated_at ? `Since ${formatDate(member.deactivated_at)}` : undefined,
    };
  }
  const expires = member.invitation_expires_at;
  // Reactivated before ever setting a password: invited again, with no link yet.
  if (!expires) return { label: "Invited", tone: "warning", detail: "No working link", needsLink: true };
  if (new Date(expires).getTime() <= now) {
    return {
      label: "Invited",
      tone: "warning",
      detail: `Link expired ${formatRelative(expires, now)}`,
      needsLink: true,
    };
  }
  return { label: "Invited", tone: "warning", detail: `Link expires ${formatRelative(expires, now)}` };
}
