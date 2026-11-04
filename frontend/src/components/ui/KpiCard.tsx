import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { cx } from "../../lib/cx";
import { Card } from "./Card";
import { Icon, type IconName } from "./Icon";
import { Skeleton } from "./Skeleton";

export interface KpiDelta {
  /** Already formatted: "+12%", "−3". */
  value: ReactNode;
  /** Direction of the change; colour follows it unless `goodWhen` says otherwise. */
  trend: "up" | "down" | "flat";
  /** Which direction is good news. Default "up"; "down" for, say, time-to-hire. */
  goodWhen?: "up" | "down";
  /** "vs last week". */
  label?: ReactNode;
}

export interface KpiCardProps {
  label: ReactNode;
  value: ReactNode;
  icon?: IconName;
  delta?: KpiDelta;
  /** A line of context under the value. */
  hint?: ReactNode;
  loading?: boolean;
  /** Makes the whole card a link to the list behind the number. */
  to?: string;
  className?: string;
}

/** One headline number. A grid of these (`.kpi-grid`) opens a dashboard. */
export function KpiCard({ label, value, icon, delta, hint, loading, to, className }: KpiCardProps) {
  const body = (
    <Card className={cx("kpi", className)} interactive={Boolean(to)} aria-busy={loading || undefined}>
      <div className="kpi-head">
        <span className="kpi-label">{label}</span>
        {icon && (
          <span className="kpi-icon" aria-hidden="true">
            <Icon name={icon} size={16} />
          </span>
        )}
      </div>
      <div className="kpi-value">{loading ? <Skeleton width="4rem" height="2rem" /> : value}</div>
      {(delta || hint) && !loading && (
        <div className="kpi-foot">
          {delta && <Delta {...delta} />}
          {hint && <span>{hint}</span>}
        </div>
      )}
    </Card>
  );

  return to ? (
    <Link to={to} className="kpi-link">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Alias: the same component under the name dashboards often use. */
export const Stat = KpiCard;

function Delta({ value, trend, goodWhen = "up", label }: KpiDelta) {
  // The colour says good or bad; the arrow says which way. A drop in time-to-hire is
  // a green arrow pointing down.
  const tone = trend === "flat" ? "flat" : trend === goodWhen ? "up" : "down";
  const icon: IconName = trend === "up" ? "trending-up" : trend === "down" ? "trending-down" : "minus";
  return (
    <span className="kpi-delta" data-trend={tone}>
      <Icon name={icon} size={12} />
      {value}
      {label && <span className="subtle"> {label}</span>}
    </span>
  );
}
