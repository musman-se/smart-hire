import type { CSSProperties } from "react";

import type { DashboardData } from "../../hooks/useDashboardData";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import {
  Card,
  CardHeader,
  SegmentedControl,
  Skeleton,
  cx,
  formatDate,
  formatNumber,
  pluralize,
} from "../ui";
import type { DayBucket } from "./metrics";
import { weekOverWeek } from "./metrics";
import { CardError } from "./parts";

type View = "chart" | "table";

const VIEW_OPTIONS = [
  { value: "chart", label: "Chart", icon: "bar-chart" },
  { value: "table", label: "Table", icon: "list" },
] as const;

function weekday(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: "short" });
}

function dayLabel(day: DayBucket, isToday: boolean): string {
  return isToday ? "Today" : `${weekday(day.date)}, ${formatDate(day.date)}`;
}

/**
 * Applications per day for the last two weeks. The chart is drawn from the newest 100
 * applications; when there are more, days the sample may not fully cover are hatched
 * and named as such, rather than drawn as quiet days.
 */
export function TrendCard({ data }: { data: DashboardData }) {
  const { trend, recent } = data;
  const [view, setView] = useLocalStorage<View>("smarthire.dashboard.trend-view", "chart");
  const change = weekOverWeek(trend);
  const hasGaps = trend.days.some((day) => !day.complete);
  const busiest = trend.days.reduce<DayBucket | null>(
    (best, day) => (day.count > (best?.count ?? 0) ? day : best),
    null,
  );

  return (
    <Card className="dashboard-card">
      <CardHeader
        icon="trending-up"
        title="Applications per day"
        description={recent.truncated ? "Last 14 days · from the latest 100" : "Last 14 days"}
        actions={
          <SegmentedControl
            size="sm"
            aria-label="Show applications per day as"
            options={VIEW_OPTIONS}
            value={view}
            onChange={setView}
          />
        }
      />

      {recent.error ? (
        <CardError error={recent.error} onRetry={data.refresh} />
      ) : recent.isLoading ? (
        <Skeleton height="10rem" />
      ) : (
        <>
          <div className="dashboard-trend-summary">
            <span className="dashboard-figure">
              <span className="dashboard-figure-value">{formatNumber(trend.total)}</span>
              <span className="dashboard-figure-label">in 14 days{hasGaps ? " (at least)" : ""}</span>
            </span>
            {trend.thisWeek !== null && (
              <span className="dashboard-figure">
                <span className="dashboard-figure-value">{formatNumber(trend.thisWeek)}</span>
                <span className="dashboard-figure-label">
                  this week
                  {change && change.difference !== 0 && (
                    <span className="dashboard-change" data-trend={change.trend}>
                      {change.difference > 0 ? " ▲ " : " ▼ "}
                      {formatNumber(Math.abs(change.difference))} vs last
                    </span>
                  )}
                </span>
              </span>
            )}
            {busiest && (
              <span className="dashboard-figure">
                <span className="dashboard-figure-value">{formatNumber(busiest.count)}</span>
                <span className="dashboard-figure-label">busiest, {formatDate(busiest.date)}</span>
              </span>
            )}
          </div>

          {view === "chart" ? (
            <>
              <TrendChart days={trend.days} max={trend.max} />
              <TrendTable days={trend.days} className="sr-only" />
            </>
          ) : (
            <TrendTable days={trend.days} />
          )}

          {hasGaps && (
            <p className="dashboard-footnote dashboard-legend">
              <span className="dashboard-legend-hatch" aria-hidden="true" />
              Hatched days may be missing applications: only the latest 100 of{" "}
              {formatNumber(recent.total ?? 0)} are loaded.
            </p>
          )}
        </>
      )}
    </Card>
  );
}

/** Bars labelled with their own counts, so no axis scale is needed to read them. */
function TrendChart({ days, max }: { days: readonly DayBucket[]; max: number }) {
  const lastIndex = days.length - 1;
  return (
    // The table beside it carries the numbers for assistive tech; this is the picture.
    <div className="dashboard-trend" aria-hidden="true">
      <ol className="dashboard-trend-bars">
        {days.map((day, index) => {
          const isToday = index === lastIndex;
          return (
            <li
              key={day.key}
              className={cx("dashboard-trend-day", isToday && "is-today", !day.complete && "is-partial")}
              title={`${dayLabel(day, isToday)}: ${pluralize(day.count, "application")}`}
            >
              <span className="dashboard-trend-plot">
                {day.count > 0 && <span className="dashboard-trend-count">{day.count}</span>}
                <span
                  className="dashboard-trend-bar"
                  style={{ "--bar-size": day.count / max } as CSSProperties}
                />
              </span>
              <span className="dashboard-trend-axis">
                <span className="dashboard-trend-weekday">{weekday(day.date).charAt(0)}</span>
                {day.date.getDate()}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function TrendTable({ days, className }: { days: readonly DayBucket[]; className?: string }) {
  const lastIndex = days.length - 1;
  return (
    <div className={cx("dashboard-trend-table", className)}>
      <table>
        <caption className="sr-only">Applications received per day, oldest first</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col" className="dashboard-num">
              Applications
            </th>
          </tr>
        </thead>
        <tbody>
          {days.map((day, index) => (
            <tr key={day.key}>
              <th scope="row">{dayLabel(day, index === lastIndex)}</th>
              <td className="dashboard-num">
                {formatNumber(day.count)}
                {!day.complete && <span className="subtle"> or more</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
