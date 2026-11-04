/**
 * How far a job's publishing run has got, read from the job's status and the
 * workflow's own report. Pure, so the awkward combinations — a job still "processing"
 * after its run died, a failure whose step is unknown — are tested rather than
 * discovered.
 */

import type { JobStatus, Publication } from "../../api/types";

type WorkflowRun = NonNullable<Publication["workflow"]>;

/** The parts of a run the progress reading needs; started_at only matters for telling
 * an old run from a new one. */
type RunSummary = Pick<WorkflowRun, "status" | "current_step"> &
  Partial<Pick<WorkflowRun, "started_at">>;

export const PUBLISH_STEPS = [
  {
    step: "analysing",
    label: "Analyse the description",
    detail: "Extracts skills, keywords and sections",
  },
  { step: "storing", label: "Store structured content", detail: "Feeds search and match scoring" },
  { step: "marking_ready", label: "Go live", detail: "Candidates can see the job and apply" },
] as const;

export type StepState = "done" | "current" | "failed" | "upcoming";

/**
 * - `idle`: never published, or returned to draft.
 * - `stuck`: the job says processing but no run is in flight — publishing again is the
 *   documented recovery.
 */
export type PublishOutcome = "idle" | "running" | "completed" | "failed" | "stuck";

export interface PublishProgress {
  outcome: PublishOutcome;
  steps: { step: string; label: string; detail: string; state: StepState }[];
}

function withStates(state: (index: number) => StepState): PublishProgress["steps"] {
  return PUBLISH_STEPS.map((step, index) => ({ ...step, state: state(index) }));
}

/** How long after a publish request a job may sit in "processing" with only its
 * previous, finished run on record before that counts as stuck. */
export const NEW_RUN_GRACE_MS = 15_000;

/**
 * Publishing again moves the job to "processing" a moment before the new run is
 * reported, so for that moment the publication still shows the last, finished run. A
 * finished run that started before the job last changed is that old run — while the
 * change is recent, the new one is still starting rather than stuck.
 */
function newRunStarting(
  run: RunSummary | null | undefined,
  recentChange: { jobUpdatedAt: string; now: number } | undefined,
): boolean {
  if (!run || !recentChange || run.status === "running" || !run.started_at) return false;
  const changedAt = Date.parse(recentChange.jobUpdatedAt);
  return (
    Date.parse(run.started_at) < changedAt && recentChange.now - changedAt < NEW_RUN_GRACE_MS
  );
}

export function publishProgress(
  jobStatus: JobStatus,
  run: RunSummary | null | undefined,
  recentChange?: { jobUpdatedAt: string; now: number },
): PublishProgress {
  if (jobStatus === "processing" && newRunStarting(run, recentChange)) {
    return {
      outcome: "running",
      steps: withStates((i) => (i === 0 ? "current" : "upcoming")),
    };
  }

  // "starting" is not a step of its own: the run is about to analyse.
  const index = PUBLISH_STEPS.findIndex((s) => s.step === run?.current_step);

  if (run?.status === "running") {
    const current = Math.max(index, 0);
    return {
      outcome: "running",
      steps: withStates((i) => (i < current ? "done" : i === current ? "current" : "upcoming")),
    };
  }
  if (jobStatus === "processing") {
    return { outcome: "stuck", steps: withStates(() => "upcoming") };
  }
  if (jobStatus === "publish_failed" || (run && run.status !== "completed")) {
    // A failed run reports "failed" as its step, so which step broke is often unknown:
    // then nothing is marked, rather than guessing.
    return {
      outcome: "failed",
      steps: withStates((i) => (i < index ? "done" : i === index ? "failed" : "upcoming")),
    };
  }
  if (run?.status === "completed" || jobStatus === "published") {
    return { outcome: "completed", steps: withStates(() => "done") };
  }
  return { outcome: "idle", steps: withStates(() => "upcoming") };
}

/** "8s", "2m 05s", "1h 03m" — how long a run took, or has been going. */
export function formatElapsed(fromIso: string | null | undefined, toMs: number): string | null {
  if (!fromIso) return null;
  const seconds = Math.max(0, Math.round((toMs - Date.parse(fromIso)) / 1000));
  if (Number.isNaN(seconds)) return null;
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}
