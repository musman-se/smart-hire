import {
  NEXT_STAGES,
  PIPELINE_STAGES,
  TERMINAL_STAGES,
  type Application,
  type ApplicationStage,
  type Notification,
  type StageChange,
} from "../../api/types";

/*
 * Rules the recruiter's application views share: which moves to offer, when a missing
 * score means something went wrong, and how an application's history reads.
 */

/** The colour a move into `to` gets on a timeline — the same on every screen. */
const STAGE_EVENT_TONE: Partial<Record<ApplicationStage, "success" | "warning" | "danger">> = {
  offer: "success",
  hired: "success",
  rejected: "danger",
  withdrawn: "warning",
};

export function stageEventTone(to: ApplicationStage): "accent" | "success" | "warning" | "danger" {
  return STAGE_EVENT_TONE[to] ?? "accent";
}

/** The marker for one entry of an application's stage history; `from` is null for the
 * application itself. */
export function stageEventIcon(
  from: ApplicationStage | null,
  to: ApplicationStage,
): "send" | "award" | "x-circle" | "arrow-right" {
  if (from === null) return "send";
  if (to === "hired") return "award";
  if (to === "rejected") return "x-circle";
  return "arrow-right";
}

/** Where a recruiter may move an application. Withdrawing is the candidate's decision
 * — the server refuses it from a recruiter — so it is never offered here. */
export function recruiterTargets(stage: ApplicationStage): ApplicationStage[] {
  return NEXT_STAGES[stage].filter((target) => target !== "withdrawn");
}

/** The one-click step forward ("Move to Interview"); null once there is none. */
export function forwardStage(stage: ApplicationStage): ApplicationStage | null {
  return recruiterTargets(stage).find((target) => target !== "rejected") ?? null;
}

/**
 * Scoring normally lands about a second after an application is created. Up to this
 * age a missing score is still on its way, and lists poll for it; past it, scoring
 * never ran and the application is stalled. One cut-off for both, so polling stops at
 * the moment "Re-run scoring" appears — on the dashboard, the queue and the job alike.
 */
export const SCORE_WAIT_MS = 60_000;

type ScoreFields = Pick<Application, "match_score" | "stage" | "created_at">;

/** Terminal applications are left alone — nobody is reviewing them any more. */
function isUnscoredActive(application: ScoreFields): boolean {
  return application.match_score == null && !TERMINAL_STAGES.has(application.stage);
}

/** An active application whose score is still on its way: worth polling for. */
export function isAwaitingScore(application: ScoreFields, now: number = Date.now()): boolean {
  return isUnscoredActive(application) && now - Date.parse(application.created_at) <= SCORE_WAIT_MS;
}

/**
 * An active application still unscored past SCORE_WAIT_MS was never processed (a
 * worker outage, say) and will not be on its own: it needs "Re-run scoring".
 */
export function isScoreStalled(application: ScoreFields, now: number = Date.now()): boolean {
  return isUnscoredActive(application) && now - Date.parse(application.created_at) > SCORE_WAIT_MS;
}

/** Poll interval for a list of applications: on while any score is on its way. */
export function scorePollInterval(applications: readonly ScoreFields[] | undefined): number | false {
  const now = Date.now();
  return applications?.some((application) => isAwaitingScore(application, now)) ? 1500 : false;
}

export interface ApplicationSummary {
  total: number;
  /** Not yet hired, rejected or withdrawn — what counts toward the candidate's cap. */
  active: number;
  /** Highest match score; null when nothing is scored yet. */
  bestScore: number | null;
  /** The furthest point reached on the forward path, ignoring where it ended. */
  furthest: ApplicationStage | null;
}

export function summarizeApplications(applications: readonly Application[]): ApplicationSummary {
  let active = 0;
  let bestScore: number | null = null;
  let furthestIndex = -1;
  for (const application of applications) {
    if (!TERMINAL_STAGES.has(application.stage)) active += 1;
    const score = application.match_score;
    if (score !== null && score !== undefined && (bestScore === null || score > bestScore)) {
      bestScore = score;
    }
    const index = (PIPELINE_STAGES as readonly ApplicationStage[]).indexOf(application.stage);
    furthestIndex = Math.max(furthestIndex, index);
  }
  return {
    total: applications.length,
    active,
    bestScore,
    furthest: PIPELINE_STAGES[furthestIndex] ?? null,
  };
}

export type ActivityEvent =
  | {
      kind: "stage";
      id: string;
      at: string;
      from: ApplicationStage | null;
      to: ApplicationStage;
      note: string | null;
    }
  | {
      kind: "message";
      id: string;
      at: string;
      subject: string;
      body: string;
      channel: string;
      recipient: string;
    };

/** Stage changes and the messages sent about them, as one story, newest first. */
export function buildActivity(
  history: readonly StageChange[],
  notifications: readonly Notification[],
): ActivityEvent[] {
  const events: ActivityEvent[] = [
    ...history.map((change, index) => ({
      kind: "stage" as const,
      id: `stage-${index}`,
      at: change.changed_at,
      from: change.from_stage,
      to: change.to_stage,
      note: change.note,
    })),
    ...notifications.map((message, index) => ({
      kind: "message" as const,
      id: `message-${index}`,
      at: message.sent_at,
      subject: message.subject,
      body: message.body,
      channel: message.channel,
      recipient: message.recipient,
    })),
  ];
  // sort() is stable, so events with the same timestamp keep their source order.
  return events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/**
 * Case-insensitive search over a few text fields: every word of the query must
 * appear in at least one of them, so "khan backend" finds Ayesha Khan's application
 * to Backend Engineer.
 */
export function matchesSearch(
  fields: readonly (string | null | undefined)[],
  query: string,
): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = fields.filter(Boolean).join("\n").toLowerCase();
  return terms.every((term) => haystack.includes(term));
}
