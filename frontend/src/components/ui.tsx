/** Small shared presentational pieces. */

import type { ReactNode } from "react";

import { ApiError } from "../api/client";
import type { ApplicationStage, JobStatus } from "../api/types";

export function StatusPill({ status }: { status: JobStatus }) {
  return <span className={`pill pill-${status}`}>{status}</span>;
}

export function StagePill({ stage }: { stage: ApplicationStage }) {
  return <span className={`pill pill-${stage}`}>{stage}</span>;
}

export function Tags({ items, highlight }: { items: string[]; highlight?: string[] }) {
  if (items.length === 0) return <span className="muted">—</span>;

  const matched = new Set(highlight ?? []);
  return (
    <>
      {items.map((item) => (
        <span key={item} className={matched.has(item) ? "tag match" : "tag"}>
          {item}
        </span>
      ))}
    </>
  );
}

/**
 * Turns a backend error code into something a recruiter can act on.
 *
 * The rule violations are not bugs — they are the platform working — so they read as
 * guidance rather than failure. Unmapped codes fall back to the server's own message,
 * which means a new backend error still surfaces usefully instead of vanishing.
 */
const RULE_COPY: Record<string, { title: string; rule: boolean }> = {
  duplicate_application: { title: "Already applied", rule: true },
  not_eligible: { title: "Not eligible for this role", rule: true },
  application_limit_reached: { title: "Application limit reached", rule: true },
  job_capacity_reached: { title: "This job is full", rule: true },
  job_not_open: { title: "Job is not accepting applications", rule: true },
  invalid_stage_transition: { title: "That stage change is not allowed", rule: true },
  duplicate_email: { title: "Email already registered", rule: true },
  validation_error: { title: "Check the form", rule: false },
  not_found: { title: "Not found", rule: false },
  internal_error: { title: "Something went wrong", rule: false },
};

export function ErrorNotice({ error }: { error: unknown }) {
  if (!error) return null;

  if (error instanceof ApiError) {
    const copy = RULE_COPY[error.code];
    return (
      <div className={`notice ${copy?.rule ? "notice-rule" : "notice-error"}`}>
        <strong>{copy?.title ?? "Request failed"}</strong>
        {error.message}
        {error.requestId && (
          <>
            {" "}
            <code>({error.code} · {error.requestId.slice(0, 8)})</code>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="notice notice-error">
      <strong>Could not reach the API</strong>
      {error instanceof Error ? error.message : String(error)}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="ghost small" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Pagination({
  total,
  limit,
  offset,
  onChange,
}: {
  total: number;
  limit: number;
  offset: number;
  onChange: (offset: number) => void;
}) {
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, total);

  return (
    <div className="pagination">
      <span>
        {from}–{to} of {total}
      </span>
      <span className="spacer" />
      <button
        type="button"
        className="small"
        disabled={offset === 0}
        onClick={() => onChange(Math.max(0, offset - limit))}
      >
        Previous
      </button>
      <button
        type="button"
        className="small"
        disabled={offset + limit >= total}
        onClick={() => onChange(offset + limit)}
      >
        Next
      </button>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
