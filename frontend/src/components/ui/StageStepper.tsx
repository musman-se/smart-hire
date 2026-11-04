import { PIPELINE_STAGES, type ApplicationStage, type StageChange } from "../../api/types";
import { cx } from "../../lib/cx";
import { humanize } from "../../lib/format";
import { Icon } from "./Icon";

type StepState = "complete" | "current" | "upcoming" | "stopped";

export interface StageStepperProps {
  stage: ApplicationStage;
  /**
   * For a rejected or withdrawn application: the last stage it reached before it
   * stopped — see stoppedAt(). Without it the stepper shows only that it stopped,
   * not where.
   */
  stoppedAt?: ApplicationStage | null;
  /** Markers only, no labels — for table rows and cards. */
  compact?: boolean;
  className?: string;
}

/**
 * For a rejected or withdrawn application, the stage it was in when it stopped: the
 * `from_stage` of the change that ended it. Null while the history is unknown.
 */
export function stoppedAt(history: readonly StageChange[] | undefined): ApplicationStage | null {
  const ending = history?.findLast(
    (change) => change.to_stage === "rejected" || change.to_stage === "withdrawn",
  );
  return ending?.from_stage ?? null;
}

interface Step {
  key: string;
  label: string;
  state: StepState;
}

function buildSteps(stage: ApplicationStage, stoppedAt: ApplicationStage | null | undefined): Step[] {
  const forward = PIPELINE_STAGES.slice(0, -1); // applied … offer; the last node is the outcome
  const terminal = stage === "rejected" || stage === "withdrawn";

  if (!terminal) {
    const current = PIPELINE_STAGES.indexOf(stage);
    return PIPELINE_STAGES.map((step, index) => ({
      key: step,
      label: humanize(step),
      // Hired is the end: shown complete, not "current".
      state: index < current || stage === "hired" ? "complete" : index === current ? "current" : "upcoming",
    }));
  }

  const reached = stoppedAt ? forward.indexOf(stoppedAt as (typeof forward)[number]) : -1;
  return [
    ...forward.map((step, index) => ({
      key: step,
      label: humanize(step),
      state: (index <= reached ? "complete" : "upcoming") as StepState,
    })),
    { key: stage, label: humanize(stage), state: "stopped" },
  ];
}

/** One line for where the application stands, shown when the labels do not fit. */
export function progressCaption(
  stage: ApplicationStage,
  stoppedAt?: ApplicationStage | null,
): string {
  const steps = buildSteps(stage, stoppedAt);
  const index = steps.findIndex((step) => step.state === "current" || step.state === "stopped");
  const step = steps[index];
  if (!step) return humanize(stage); // hired: every step is complete, none is current
  if (step.state === "stopped") {
    return stoppedAt ? `${step.label} at ${humanize(stoppedAt)}` : step.label;
  }
  return `Step ${index + 1} of ${steps.length} · ${step.label}`;
}

/**
 * Where an application is on applied → screening → interview → offer → hired. A
 * rejected or withdrawn one ends in a distinct final marker instead of "hired", with
 * the stages it got through still filled in.
 *
 * Five labels need about 24rem. In a narrower box (a side rail, a phone) they would run
 * into each other, so the stepper measures its own width with a container query and
 * swaps them for a one-line caption; the labels stay for screen readers.
 */
export function StageStepper({ stage, stoppedAt, compact, className }: StageStepperProps) {
  const steps = buildSteps(stage, stoppedAt);
  const outcome = stage === "rejected" || stage === "withdrawn" ? stage : undefined;

  const list = (
    <ol
      className={cx("stepper", compact && "stepper-compact", compact && className)}
      data-outcome={outcome}
      aria-label={`Application progress: ${humanize(stage)}`}
    >
      {steps.map((step, index) => (
        <li
          key={step.key}
          className="stepper-step"
          data-state={step.state}
          aria-current={step.state === "current" ? "step" : undefined}
          title={compact ? step.label : undefined}
        >
          <span className="stepper-marker" aria-hidden="true">
            {step.state === "complete" ? (
              <Icon name="check" size={12} strokeWidth={3} />
            ) : step.state === "stopped" ? (
              <Icon name="x" size={12} strokeWidth={3} />
            ) : (
              index + 1
            )}
          </span>
          <span className={compact ? "sr-only" : "stepper-label"}>
            {step.label}
            {step.state === "complete" && <span className="sr-only"> (done)</span>}
          </span>
        </li>
      ))}
    </ol>
  );
  if (compact) return list;

  return (
    <div className={cx("stepper-frame", className)}>
      {list}
      {/* aria-hidden: the list's own label and its visually hidden labels say this. */}
      <p className="stepper-caption" aria-hidden="true">
        {progressCaption(stage, stoppedAt)}
      </p>
    </div>
  );
}
