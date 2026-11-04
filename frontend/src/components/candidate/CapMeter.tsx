import { ProgressBar, cx, pluralize } from "../ui";
import { capState } from "./applications";

const TONE = { ok: "accent", near: "warning", full: "danger" } as const;

/** "3 of 10 active applications", with a bar that warms up as the cap gets close. */
export function CapMeter({ active, className }: { active: number; className?: string }) {
  const cap = capState(active);
  const summary = `${cap.used} of ${cap.max} active applications`;
  const hint =
    cap.level === "full"
      ? "You're at the limit. Withdraw one, or wait for a decision, to apply again."
      : `${pluralize(cap.remaining, "slot")} left. Applications that are hired, rejected or withdrawn don't count.`;

  return (
    <div className={cx("candidate-cap", className)} data-level={cap.level}>
      <div className="row-between">
        <span className="candidate-cap-label">{summary}</span>
        <span className="candidate-cap-value tabular" aria-hidden="true">
          {cap.used}/{cap.max}
        </span>
      </div>
      <ProgressBar
        value={cap.used}
        max={cap.max}
        label="Active applications"
        valueText={summary}
        tone={TONE[cap.level]}
        size="sm"
      />
      <p className="candidate-cap-hint">{hint}</p>
    </div>
  );
}
