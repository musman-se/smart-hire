import type { ReactNode } from "react";

import { ApiError } from "../../api/client";
import { cx } from "../../lib/cx";
import { Icon, type IconName } from "./Icon";

export type NoticeTone = "info" | "success" | "warning" | "rule" | "error";

const TONE_ICON: Record<NoticeTone, IconName> = {
  info: "info",
  success: "check-circle",
  warning: "alert-triangle",
  rule: "alert-triangle",
  error: "alert-circle",
};

export interface NoticeProps {
  tone?: NoticeTone;
  title?: ReactNode;
  children?: ReactNode;
  /** Buttons under the message. */
  action?: ReactNode;
  className?: string;
}

/** An inline message block. Errors and rule violations are announced (role="alert");
 * the other tones are not, so they do not interrupt. */
export function Notice({ tone = "info", title, children, action, className }: NoticeProps) {
  const urgent = tone === "error" || tone === "rule";
  return (
    <div
      className={cx("notice", `notice-${tone}`, className)}
      role={urgent ? "alert" : undefined}
    >
      <Icon name={TONE_ICON[tone]} size={16} />
      <div className="notice-body">
        {title && <span className="notice-title">{title}</span>}
        {children}
        {action && <div className="notice-actions">{action}</div>}
      </div>
    </div>
  );
}

/**
 * Turns a backend error code into something a user can act on.
 *
 * The rule violations are not bugs — they are the platform working — so they read as
 * guidance (`rule: true`, amber) rather than failure (red). Unmapped codes fall back to
 * the server's own message, so a new backend error still surfaces usefully instead of
 * vanishing.
 */
export const RULE_COPY: Record<string, { title: string; rule: boolean }> = {
  duplicate_application: { title: "Already applied", rule: true },
  not_eligible: { title: "Not eligible for this role", rule: true },
  application_limit_reached: { title: "Application limit reached", rule: true },
  job_capacity_reached: { title: "This job is full", rule: true },
  job_not_open: { title: "Job is not accepting applications", rule: true },
  invalid_stage_transition: { title: "That stage change is not allowed", rule: true },
  duplicate_email: { title: "Email already registered — sign in instead", rule: true },
  invalid_credentials: { title: "Could not sign in", rule: false },
  not_authenticated: { title: "Signed out", rule: false },
  invalid_token: { title: "Your session has ended", rule: false },
  forbidden: { title: "Not allowed for your role", rule: true },
  account_deactivated: { title: "This account has been deactivated", rule: true },
  invalid_invitation: { title: "This invitation link no longer works", rule: true },
  invitation_not_allowed: { title: "No invitation needed", rule: true },
  cannot_deactivate_self: { title: "You cannot deactivate your own account", rule: true },
  workflow_unavailable: { title: "The workflow engine is unavailable", rule: false },
  idempotency_in_progress: { title: "Still processing your first attempt", rule: true },
  idempotency_key_reused: { title: "Request changed since the first attempt", rule: false },
  validation_error: { title: "Check the form", rule: false },
  not_found: { title: "Not found", rule: false },
  internal_error: { title: "Something went wrong", rule: false },
};

export interface DescribedError {
  title: string;
  message: string;
  /** A business rule doing its job, rather than a failure. */
  rule: boolean;
}

/** Title, message and kind for any thrown value — shared by ErrorNotice and toasts. */
export function describeError(error: unknown): DescribedError {
  if (error instanceof ApiError) {
    const copy = RULE_COPY[error.code];
    return {
      title: copy?.title ?? "Request failed",
      message: error.message,
      rule: copy?.rule ?? false,
    };
  }
  return {
    title: "Could not reach the API",
    message: error instanceof Error ? error.message : String(error),
    rule: false,
  };
}

/** Renders nothing for a falsy error, so it can sit permanently under a form. */
export function ErrorNotice({ error, className }: { error: unknown; className?: string }) {
  if (!error) return null;
  const { title, message, rule } = describeError(error);
  const reference =
    error instanceof ApiError && error.requestId
      ? `${error.code} · ${error.requestId.slice(0, 8)}`
      : null;

  return (
    <Notice tone={rule ? "rule" : "error"} title={title} className={className}>
      {message}
      {reference && (
        <>
          {" "}
          <code>({reference})</code>
        </>
      )}
    </Notice>
  );
}
