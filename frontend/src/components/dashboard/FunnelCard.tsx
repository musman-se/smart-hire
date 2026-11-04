import type { CSSProperties } from "react";
import { Link } from "react-router-dom";

import type { DashboardData } from "../../hooks/useDashboardData";
import {
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  Skeleton,
  formatNumber,
  formatPercent,
  humanize,
} from "../ui";
import { CardError, StageSwatch, stageColor } from "./parts";

/**
 * Applied → hired as horizontal bars, each as long as the share of all applications
 * that reached it. A table underneath, so the numbers are read row by row rather than
 * guessed from bar lengths — and so a screen reader gets the same thing.
 */
export function FunnelCard({ data }: { data: DashboardData }) {
  const { funnel, stageCounts } = data;

  return (
    <Card className="dashboard-card">
      <CardHeader
        icon="bar-chart"
        title="Hiring funnel"
        description="How far applications get, across every job"
        actions={
          funnel.hireRate !== null && (
            <span className="dashboard-figure">
              <span className="dashboard-figure-value">{formatPercent(funnel.hireRate, 1)}</span>
              <span className="dashboard-figure-label">hire rate</span>
            </span>
          )
        }
      />

      {stageCounts.isError ? (
        <CardError error={new Error("Some stage totals could not be loaded.")} onRetry={data.refresh} />
      ) : stageCounts.isLoading ? (
        <FunnelSkeleton />
      ) : funnel.entered === 0 ? (
        <EmptyState
          compact
          icon="bar-chart"
          title="No applications yet"
          description="The funnel fills in as candidates apply and you move them through stages."
          action={
            <ButtonLink to="/jobs" size="sm" rightIcon="arrow-right">
              Go to jobs
            </ButtonLink>
          }
        />
      ) : (
        <>
          <table className="dashboard-funnel">
            <caption className="sr-only">
              Applications that reached each stage, with conversion from the stage before
            </caption>
            <thead>
              <tr>
                <th scope="col">Stage</th>
                <th scope="col" className="dashboard-funnel-bar-col">
                  <span className="sr-only">Share of all applications</span>
                </th>
                <th scope="col" className="dashboard-num">
                  Reached
                </th>
                <th scope="col" className="dashboard-num dashboard-hide-sm">
                  Here now
                </th>
                <th scope="col" className="dashboard-num">
                  Conversion
                </th>
              </tr>
            </thead>
            <tbody>
              {funnel.steps.map((step) => {
                const share = step.reached / funnel.entered;
                return (
                  <tr key={step.stage}>
                    <th scope="row">
                      <Link to={`/applications?stage=${step.stage}`} className="dashboard-stage-link">
                        <StageSwatch stage={step.stage} />
                        {humanize(step.stage)}
                      </Link>
                    </th>
                    <td className="dashboard-funnel-bar-col">
                      <span className="sr-only">{formatPercent(share)}</span>
                      <span className="dashboard-funnel-track" aria-hidden="true">
                        <span
                          className="dashboard-funnel-bar"
                          style={
                            {
                              "--bar-size": share,
                              "--bar-color": stageColor(step.stage),
                            } as CSSProperties
                          }
                        />
                      </span>
                    </td>
                    <td className="dashboard-num">{formatNumber(step.reached)}</td>
                    <td className="dashboard-num dashboard-hide-sm subtle">{formatNumber(step.current)}</td>
                    <td className="dashboard-num">
                      {step.conversion === null ? (
                        <span className="subtle">—</span>
                      ) : (
                        formatPercent(step.conversion)
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="dashboard-dropoff">
            <span className="dashboard-dropoff-label">Left the pipeline</span>
            <Link to="/applications?stage=rejected" className="dashboard-stage-link">
              <StageSwatch stage="rejected" />
              {formatNumber(funnel.rejected)} rejected
            </Link>
            <Link to="/applications?stage=withdrawn" className="dashboard-stage-link">
              <StageSwatch stage="withdrawn" />
              {formatNumber(funnel.withdrawn)} withdrawn
            </Link>
          </div>
          <p className="dashboard-footnote">
            Reached counts applications at a stage or past it. Totals record only where an
            application is now, so rejected and withdrawn ones count toward Applied alone.
          </p>
        </>
      )}
    </Card>
  );
}

function FunnelSkeleton() {
  return (
    <div className="dashboard-skeleton-list" aria-busy="true">
      <span className="sr-only">Loading the funnel…</span>
      {[100, 64, 40, 22, 12].map((width) => (
        <div key={width} className="dashboard-skeleton-row">
          <Skeleton width="5rem" />
          <Skeleton width={`${width}%`} height="0.75rem" />
        </div>
      ))}
    </div>
  );
}
