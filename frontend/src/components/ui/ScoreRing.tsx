import { cx } from "../../lib/cx";

export type ScoreBand = "high" | "mid" | "low" | "pending";

/** The bands used everywhere a match score is coloured: 75+ strong, 50+ fair. */
export function scoreBand(score: number | null | undefined): ScoreBand {
  if (score === null || score === undefined) return "pending";
  if (score >= 75) return "high";
  if (score >= 50) return "mid";
  return "low";
}

export interface ScoreRingProps {
  /** 0–100, or null/undefined while scoring has not happened (or for candidates,
   * who never see scores). */
  score: number | null | undefined;
  /** Diameter in px. */
  size?: number;
  strokeWidth?: number;
  /** Hide the number in the middle — for very small rings next to a label. */
  hideLabel?: boolean;
  className?: string;
}

/** A match score as a ring that fills and colours by band. */
export function ScoreRing({ score, size = 40, strokeWidth = 4, hideLabel, className }: ScoreRingProps) {
  const band = scoreBand(score);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = score === null || score === undefined ? 0 : Math.min(Math.max(score, 0), 100) / 100;
  const label = band === "pending" ? "Match score pending" : `Match score ${Math.round(score ?? 0)} of 100`;

  return (
    <span
      className={cx("score-ring", className)}
      data-band={band}
      role="img"
      aria-label={label}
      title={label}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          className="score-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
        />
        {band !== "pending" && (
          <circle
            className="score-ring-value"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - fraction)}
          />
        )}
      </svg>
      {!hideLabel && (
        <span className="score-ring-label" aria-hidden="true" style={{ fontSize: Math.max(10, size * 0.3) }}>
          {band === "pending" ? "–" : Math.round(score ?? 0)}
        </span>
      )}
    </span>
  );
}
