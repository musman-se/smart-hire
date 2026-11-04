import type { ReactNode } from "react";

import type { DashboardData } from "../../hooks/useDashboardData";
import { KpiCard, formatNumber, formatPercent, pluralize } from "../ui";
import { weekOverWeek } from "./metrics";

function count(value: number | undefined): ReactNode {
  return value === undefined ? "—" : formatNumber(value);
}

function signed(value: number): string {
  // A true minus sign: a hyphen reads as a dash next to a number.
  return value > 0 ? `+${formatNumber(value)}` : value < 0 ? `−${formatNumber(-value)}` : "±0";
}

/**
 * Two rows of headline numbers: the pipeline, then the jobs feeding it. Every count is
 * an exact server total; only the average score is a sample, and it says so.
 */
export function DashboardKpis({ data }: { data: DashboardData }) {
  const { jobCounts, stageCounts, funnel, score, recent, trend } = data;
  const change = weekOverWeek(trend);
  const applications = stageCounts.isLoading ? undefined : stageCounts.total;
  const failed = jobCounts.counts.publish_failed ?? 0;
  const processing = jobCounts.counts.processing ?? 0;

  return (
    <section className="kpi-grid dashboard-kpis" aria-label="Key numbers">
      <KpiCard
        label="Applications"
        icon="inbox"
        value={count(applications)}
        loading={stageCounts.isLoading}
        to="/applications?stage=all"
        delta={
          change
            ? { value: signed(change.difference), trend: change.trend, label: "vs last week" }
            : undefined
        }
        hint={change ? undefined : "All time"}
      />
      {/* No link: the queue filters by one stage at a time, so no list holds exactly
          these. The funnel below links each stage that makes up the number. */}
      <KpiCard
        label="Active in pipeline"
        icon="activity"
        value={count(stageCounts.isLoading ? undefined : data.activeApplications)}
        loading={stageCounts.isLoading}
        hint={
          applications
            ? `${formatPercent(data.activeApplications / applications)} of all applications`
            : "Not hired, rejected or withdrawn"
        }
      />
      <KpiCard
        label="Hires"
        icon="award"
        value={count(stageCounts.counts.hired)}
        loading={stageCounts.isLoading}
        to="/applications?stage=hired"
        hint={funnel.hireRate === null ? "None yet" : `${formatPercent(funnel.hireRate, 1)} hire rate`}
      />
      <KpiCard
        label="Avg. match score"
        icon="target"
        value={score.average === null ? "—" : Math.round(score.average)}
        loading={recent.isLoading}
        hint={
          score.scored === 0
            ? "No scored applications yet"
            : `${pluralize(score.scored, "scored application")}${recent.truncated ? " · latest 100" : ""}`
        }
      />

      <KpiCard
        label="Open jobs"
        icon="briefcase"
        value={count(jobCounts.counts.published)}
        loading={jobCounts.isLoading}
        to="/jobs?status=published"
        hint="Accepting applications"
      />
      <KpiCard
        label="Drafts"
        icon="file-text"
        value={count(jobCounts.counts.draft)}
        loading={jobCounts.isLoading}
        to="/jobs?status=draft"
        hint="Not yet published"
      />
      <KpiCard
        label="Publishing"
        icon="refresh"
        value={count(jobCounts.counts.processing)}
        loading={jobCounts.isLoading}
        to="/jobs?status=processing"
        hint={processing > 0 ? "Workflow running" : "Nothing in flight"}
      />
      <KpiCard
        label="Publish failures"
        icon="alert-triangle"
        className={failed > 0 ? "dashboard-kpi-alert" : undefined}
        value={count(jobCounts.counts.publish_failed)}
        loading={jobCounts.isLoading}
        to="/jobs?status=publish_failed"
        hint={failed > 0 ? "Retry under Needs attention" : "Every publish went through"}
      />
    </section>
  );
}
