/**
 * The recruiter dashboard's arithmetic, kept free of React so every rule can be tested
 * against a fixed clock. Components only lay out what these functions return.
 */

import {
  APPLICATION_STAGES,
  PIPELINE_STAGES,
  TERMINAL_STAGES,
  type Application,
  type ApplicationStage,
  type Job,
} from "../../api/types";
import { isAwaitingScore, isScoreStalled } from "../applications/stages";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export type StageCounts = Record<ApplicationStage, number | undefined>;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

// --- Funnel ----------------------------------------------------------------------

export interface FunnelStep {
  stage: PipelineStage;
  /** Applications sitting at this stage right now. */
  current: number;
  /** Applications at this stage or further along the forward path. */
  reached: number;
  /** Share of the previous step's `reached` that got here; null for the first step,
   * or when the previous step is empty (no rate to speak of). */
  conversion: number | null;
}

export interface Funnel {
  steps: FunnelStep[];
  /** Every application ever received: everyone enters at "applied". */
  entered: number;
  rejected: number;
  withdrawn: number;
  /** hired ÷ entered, or null before the first application. */
  hireRate: number | null;
}

/**
 * A funnel from current-stage totals. The API reports where applications are now,
 * not every stage they passed through, so "reached" counts an application at its
 * stage and every stage before it. Rejected and withdrawn applications left from a
 * stage the totals do not record, so they count toward "applied" only — the funnel
 * under-reports, never over-reports, how far people got.
 */
export function buildFunnel(counts: StageCounts): Funnel {
  const count = (stage: ApplicationStage) => counts[stage] ?? 0;
  const rejected = count("rejected");
  const withdrawn = count("withdrawn");

  const reached = new Map<PipelineStage, number>();
  let downstream = 0;
  for (const stage of [...PIPELINE_STAGES].reverse()) {
    downstream += count(stage);
    reached.set(stage, downstream);
  }
  const entered = downstream + rejected + withdrawn;
  reached.set("applied", entered);

  const steps: FunnelStep[] = [];
  let previous: number | null = null;
  for (const stage of PIPELINE_STAGES) {
    const value = reached.get(stage) ?? 0;
    steps.push({
      stage,
      current: count(stage),
      reached: value,
      conversion: previous ? value / previous : null,
    });
    previous = value;
  }

  return {
    steps,
    entered,
    rejected,
    withdrawn,
    hireRate: entered > 0 ? count("hired") / entered : null,
  };
}

/** Applications still moving through the pipeline: not hired, rejected or withdrawn. */
export function activeCount(counts: StageCounts): number {
  return APPLICATION_STAGES.filter((stage) => !TERMINAL_STAGES.has(stage)).reduce(
    (sum, stage) => sum + (counts[stage] ?? 0),
    0,
  );
}

// --- Daily trend -----------------------------------------------------------------

export interface DayBucket {
  /** Local calendar day, "2026-11-03". */
  key: string;
  date: Date;
  count: number;
  /** False when some of this day's applications may lie beyond the loaded page. */
  complete: boolean;
}

export interface Trend {
  days: DayBucket[];
  /** The tallest day, at least 1 so bar heights never divide by zero. */
  max: number;
  /** Applications inside the window. */
  total: number;
  /** The last 7 days and the 7 before them; null unless every day in that week is
   * complete, so a truncated page never passes for a quiet week. */
  thisWeek: number | null;
  lastWeek: number | null;
}

function startOfDay(time: number): Date {
  const date = new Date(time);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function weekSum(days: readonly DayBucket[]): number | null {
  if (days.length < 7 || days.some((day) => !day.complete)) return null;
  return days.reduce((sum, day) => sum + day.count, 0);
}

/**
 * Applications per local calendar day, oldest first, ending today.
 *
 * `truncated` says the server holds more applications than were loaded. The page is
 * newest-first, so the gap is at the old end: the day of the oldest loaded
 * application, and every day before it, may be missing some.
 */
export function dailyTrend(
  applications: readonly Application[],
  { days = 14, now = Date.now(), truncated = false }: { days?: number; now?: number; truncated?: boolean } = {},
): Trend {
  const today = startOfDay(now);
  const counts = new Map<string, number>();
  let oldest = Infinity;
  for (const application of applications) {
    const created = Date.parse(application.created_at);
    if (Number.isNaN(created)) continue;
    oldest = Math.min(oldest, created);
    const key = dayKey(startOfDay(created));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const coverageStart = truncated && Number.isFinite(oldest) ? startOfDay(oldest).getTime() : -Infinity;

  const buckets: DayBucket[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    // Built from calendar parts rather than by subtracting 24h, so a DST change
    // cannot skip or repeat a day.
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
    const key = dayKey(date);
    buckets.push({ key, date, count: counts.get(key) ?? 0, complete: date.getTime() > coverageStart });
  }

  return {
    days: buckets,
    max: Math.max(1, ...buckets.map((day) => day.count)),
    total: buckets.reduce((sum, day) => sum + day.count, 0),
    thisWeek: weekSum(buckets.slice(-7)),
    lastWeek: buckets.length >= 14 ? weekSum(buckets.slice(-14, -7)) : null,
  };
}

export interface WeekChange {
  /** This week minus last week. */
  difference: number;
  trend: "up" | "down" | "flat";
}

/** This week against last, or null when either week is not fully covered by the data. */
export function weekOverWeek(trend: Pick<Trend, "thisWeek" | "lastWeek">): WeekChange | null {
  if (trend.thisWeek === null || trend.lastWeek === null) return null;
  const difference = trend.thisWeek - trend.lastWeek;
  return { difference, trend: difference > 0 ? "up" : difference < 0 ? "down" : "flat" };
}

// --- Match scores ----------------------------------------------------------------

/** The mean of the scored applications; unscored ones are left out, not counted as 0. */
export function averageScore(applications: readonly Application[]): {
  average: number | null;
  scored: number;
} {
  const scores = applications
    .map((application) => application.match_score)
    .filter((score): score is number => typeof score === "number");
  if (scores.length === 0) return { average: null, scored: 0 };
  return {
    average: scores.reduce((sum, score) => sum + score, 0) / scores.length,
    scored: scores.length,
  };
}

// --- Volume per job --------------------------------------------------------------

export interface JobVolume {
  jobId: string;
  total: number;
  /** Not yet hired, rejected or withdrawn. */
  active: number;
  byStage: Record<ApplicationStage, number>;
}

function emptyStageRecord(): Record<ApplicationStage, number> {
  return Object.fromEntries(APPLICATION_STAGES.map((stage) => [stage, 0])) as Record<
    ApplicationStage,
    number
  >;
}

/** Applications grouped by job, busiest first (total, then active, then id for a
 * stable order between renders). */
export function jobVolumes(applications: readonly Application[]): JobVolume[] {
  const byJob = new Map<string, JobVolume>();
  for (const application of applications) {
    let volume = byJob.get(application.job_id);
    if (!volume) {
      volume = { jobId: application.job_id, total: 0, active: 0, byStage: emptyStageRecord() };
      byJob.set(application.job_id, volume);
    }
    volume.total += 1;
    volume.byStage[application.stage] += 1;
    if (!TERMINAL_STAGES.has(application.stage)) volume.active += 1;
  }
  return [...byJob.values()].sort(
    (a, b) => b.total - a.total || b.active - a.active || a.jobId.localeCompare(b.jobId),
  );
}

/** A stacked bar in words, for screen readers and tooltips: "3 applied, 1 hired".
 * Empty stages are left out; they would only be noise. */
export function describeBreakdown(byStage: Record<ApplicationStage, number>): string {
  const parts = APPLICATION_STAGES.filter((stage) => byStage[stage] > 0).map(
    (stage) => `${byStage[stage]} ${stage}`,
  );
  return parts.length > 0 ? parts.join(", ") : "No applications";
}

/** The job with the most applications still in play — where a recruiter's time goes. */
export function busiestJob(volumes: readonly JobVolume[]): JobVolume | null {
  let busiest: JobVolume | null = null;
  for (const volume of volumes) {
    if (volume.active > 0 && (!busiest || volume.active > busiest.active)) busiest = volume;
  }
  return busiest;
}

// --- Needs attention -------------------------------------------------------------

export const ATTENTION_RULES = {
  /** Publishing takes seconds; this long means the workflow has stalled. */
  stuckProcessingMs: 5 * MINUTE,
  /** An application untouched in "applied" this long is a candidate left waiting. */
  staleAppliedMs: 3 * DAY,
  /** Share of max_applications at which a job is flagged as filling up. */
  nearCapacity: 0.8,
} as const;

/** True while some active application's score is still on its way — the window in
 * which polling is worth it. Past SCORE_WAIT_MS it is an attention item instead. */
export function awaitingScore(applications: readonly Application[], now: number): boolean {
  return applications.some((application) => isAwaitingScore(application, now));
}

export type AttentionTone = "danger" | "warning" | "info";

export type AttentionItem =
  | { kind: "publish_failed"; key: string; tone: "danger"; job: Job }
  | { kind: "capacity"; key: string; tone: "danger" | "warning"; job: Job; received: number; cap: number }
  | { kind: "stuck_processing"; key: string; tone: "warning"; job: Job; ageMs: number }
  | { kind: "unscored"; key: string; tone: "warning"; application: Application; ageMs: number }
  | { kind: "stale_applied"; key: string; tone: "info"; jobId: string; count: number; oldestAgeMs: number };

export interface AttentionInput {
  failedJobs: readonly Job[];
  processingJobs: readonly Job[];
  /** Published jobs that have a cap, with every application each has received. */
  intake: readonly { job: Job; received: number }[];
  /** The newest applications, for spotting ones scoring never reached. */
  recentApplications: readonly Application[];
  /** Applications in "applied", ideally the oldest ones. */
  appliedApplications: readonly Application[];
  now: number;
}

const TONE_ORDER: Record<AttentionTone, number> = { danger: 0, warning: 1, info: 2 };

function age(timestamp: string, now: number): number {
  return now - Date.parse(timestamp);
}

/**
 * Everything on the dashboard that needs a recruiter's hand, most urgent first:
 * broken (danger), then slipping (warning), then waiting (info). Within a tone, items
 * keep the order the rules below add them in, and each rule lists its oldest first.
 */
export function attentionItems(input: AttentionInput): AttentionItem[] {
  const { now } = input;
  const items: AttentionItem[] = [];

  for (const job of input.failedJobs) {
    items.push({ kind: "publish_failed", key: `failed-${job.id}`, tone: "danger", job });
  }

  for (const { job, received } of input.intake) {
    const cap = job.max_applications;
    if (!cap || received / cap < ATTENTION_RULES.nearCapacity) continue;
    const tone = received >= cap ? "danger" : "warning";
    items.push({ kind: "capacity", key: `capacity-${job.id}`, tone, job, received, cap });
  }

  input.processingJobs
    .map((job) => ({ job, ageMs: age(job.updated_at, now) }))
    .filter(({ ageMs }) => ageMs > ATTENTION_RULES.stuckProcessingMs)
    .sort((a, b) => b.ageMs - a.ageMs)
    .forEach(({ job, ageMs }) =>
      items.push({ kind: "stuck_processing", key: `stuck-${job.id}`, tone: "warning", job, ageMs }),
    );

  input.recentApplications
    .filter((application) => isScoreStalled(application, now))
    .map((application) => ({ application, ageMs: age(application.created_at, now) }))
    .sort((a, b) => b.ageMs - a.ageMs)
    .forEach(({ application, ageMs }) =>
      items.push({ kind: "unscored", key: `unscored-${application.id}`, tone: "warning", application, ageMs }),
    );

  // One item per job rather than per application: "6 waiting for Backend Engineer"
  // is something to act on; six separate rows are noise.
  const stale = new Map<string, { count: number; oldestAgeMs: number }>();
  for (const application of input.appliedApplications) {
    if (application.stage !== "applied") continue;
    const ageMs = age(application.created_at, now);
    if (ageMs <= ATTENTION_RULES.staleAppliedMs) continue;
    const group = stale.get(application.job_id) ?? { count: 0, oldestAgeMs: 0 };
    stale.set(application.job_id, {
      count: group.count + 1,
      oldestAgeMs: Math.max(group.oldestAgeMs, ageMs),
    });
  }
  [...stale.entries()]
    .sort(([, a], [, b]) => b.oldestAgeMs - a.oldestAgeMs)
    .forEach(([jobId, group]) =>
      items.push({ kind: "stale_applied", key: `stale-${jobId}`, tone: "info", jobId, ...group }),
    );

  // Array.prototype.sort is stable, so each rule's own ordering survives.
  return items.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);
}

/** "12m", "3h", "4d": a duration with no "ago", for "publishing for 12m". */
export function formatDuration(ms: number): string {
  if (ms < 60 * MINUTE) return `${Math.max(1, Math.round(ms / MINUTE))}m`;
  if (ms < DAY) return `${Math.round(ms / (60 * MINUTE))}h`;
  return `${Math.round(ms / DAY)}d`;
}
