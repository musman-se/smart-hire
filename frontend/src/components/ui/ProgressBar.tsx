import { cx } from "../../lib/cx";

export interface ProgressBarProps {
  value: number;
  max?: number;
  /** Required: what is progressing — "Applications used", "Profile complete". */
  label: string;
  /** What a screen reader hears instead of a bare percentage: "4 of 10". */
  valueText?: string;
  tone?: "accent" | "success" | "warning" | "danger" | "info";
  size?: "sm" | "md";
  className?: string;
}

export function ProgressBar({
  value,
  max = 100,
  label,
  valueText,
  tone = "accent",
  size = "md",
  className,
}: ProgressBarProps) {
  const clamped = Math.min(Math.max(value, 0), max);
  const percent = max > 0 ? (clamped / max) * 100 : 0;
  return (
    <div
      className={cx("progress", tone !== "accent" && `progress-${tone}`, size === "sm" && "progress-sm", className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={clamped}
      aria-valuetext={valueText}
    >
      <div className="progress-bar" style={{ width: `${percent}%` }} />
    </div>
  );
}
