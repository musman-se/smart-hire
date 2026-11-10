import { useState } from "react";

import { useUser } from "../../auth/AuthProvider";
import { ActivityCard } from "../../components/dashboard/ActivityCard";
import { AttentionCard } from "../../components/dashboard/AttentionCard";
import { DashboardKpis } from "../../components/dashboard/DashboardKpis";
import { FunnelCard } from "../../components/dashboard/FunnelCard";
import { GettingStarted } from "../../components/dashboard/GettingStarted";
import { TopJobsCard } from "../../components/dashboard/TopJobsCard";
import { TrendCard } from "../../components/dashboard/TrendCard";
import { greetingFor } from "../../components/dashboard/greeting";
import {
  Badge,
  Button,
  ButtonLink,
  Icon,
  Notice,
  PageHeader,
  formatDateTime,
  formatNumber,
  formatRelative,
  greeting,
  pluralize,
} from "../../components/ui";
import { useDashboardData, type DashboardData } from "../../hooks/useDashboardData";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useJobsByIds, useRecruiterProfile } from "../../hooks/queries";

/** The recruiter's landing page (/dashboard): what is happening, and what needs a hand. */
export function DashboardPage() {
  useDocumentTitle("Dashboard");
  const user = useUser();
  const data = useDashboardData();
  const profile = useRecruiterProfile();
  const [refreshing, setRefreshing] = useState(false);

  const now = new Date(data.now);
  const name = greetingFor(user.email, profile.data?.full_name);
  const title = name ? `${greeting(now.getHours())}, ${name}` : greeting(now.getHours());
  const today = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  const busiest = useJobsByIds(data.busiest ? [data.busiest.jobId] : []).byId.get(
    data.busiest?.jobId ?? "",
  );
  const waiting = data.stageCounts.counts.applied;
  const totalsFailed = data.jobCounts.isError || data.stageCounts.isError;
  const emptyWorkspace =
    !data.jobCounts.isLoading &&
    !data.stageCounts.isLoading &&
    !totalsFailed &&
    data.jobCounts.total === 0 &&
    data.stageCounts.total === 0;

  function refresh() {
    setRefreshing(true);
    data.refresh().finally(() => setRefreshing(false));
  }

  return (
    <div className="dashboard">
      <PageHeader
        title={title}
        description={summary(data, waiting)}
        meta={
          <>
            <span className="meta-item">
              <Icon name="calendar" size={14} />
              {today}
            </span>
            {data.recent.updatedAt > 0 && (
              <span className="meta-item" title={formatDateTime(data.recent.updatedAt)}>
                <Icon name="clock" size={14} />
                Updated {formatRelative(data.recent.updatedAt, data.now)}
              </span>
            )}
          </>
        }
        actions={
          <>
            <Button variant="ghost" leftIcon="refresh" loading={refreshing} onClick={refresh}>
              Refresh
            </Button>
            {data.busiest && (
              <ButtonLink
                to={`/jobs/${data.busiest.jobId}/pipeline`}
                leftIcon="kanban"
                title={busiest ? `Pipeline for ${busiest.title}` : undefined}
              >
                <span className="dashboard-action-label">
                  Open pipeline{busiest && <span className="dashboard-hide-sm">: {busiest.title}</span>}
                </span>
              </ButtonLink>
            )}
            <ButtonLink to="/applications?stage=applied" leftIcon="inbox">
              Review applications
              {waiting ? (
                <Badge tone="accent" size="sm">
                  {formatNumber(waiting)}
                </Badge>
              ) : null}
            </ButtonLink>
            <ButtonLink to="/jobs/new" variant="primary" leftIcon="plus">
              New job
            </ButtonLink>
          </>
        }
      />

      {totalsFailed && (
        <Notice
          tone="error"
          title="Some totals could not be loaded"
          action={
            <Button size="sm" leftIcon="refresh" onClick={refresh}>
              Try again
            </Button>
          }
        >
          Numbers shown as “—” are unknown, not zero.
        </Notice>
      )}

      <DashboardKpis data={data} />

      {emptyWorkspace ? (
        <GettingStarted />
      ) : (
        <>
          <AttentionCard data={data} />
          <div className="dashboard-columns">
            <div className="dashboard-column">
              <FunnelCard data={data} />
              <TrendCard data={data} />
            </div>
            <div className="dashboard-column">
              <TopJobsCard data={data} />
              <ActivityCard data={data} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** One sentence on what is waiting, so the page answers "anything for me?" up top. */
function summary(data: DashboardData, waiting: number | undefined): string {
  if (data.stageCounts.isLoading || data.attention.isLoading) return "Here is where hiring stands today.";
  const parts: string[] = [];
  if (waiting) parts.push(`${pluralize(waiting, "application")} waiting for a first review`);
  const attention = data.attention.items.length;
  if (attention) parts.push(`${pluralize(attention, "thing")} that need${attention === 1 ? "s" : ""} attention`);
  if (parts.length === 0) return "You are all caught up. Here is where hiring stands today.";
  return `You have ${parts.join(" and ")}.`;
}
