import { Link } from "react-router-dom";

import type { Application } from "../../api/types";
import { useJobsByIds } from "../../hooks/queries";
import { useHistories, useNotificationsFor } from "../../hooks/useCandidateExtras";
import {
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  SkeletonText,
  Timeline,
  formatDateTime,
  formatRelative,
  type TimelineItem,
} from "../ui";
import { buildActivity, type ActivityEvent } from "./activity";
import { UNLISTED_JOB } from "./JobTitle";
import { STAGE_COPY } from "./stageCopy";

/** How many applications the feed reads: two requests each (history and messages). */
export const FEED_APPLICATIONS = 10;

/** Opens the application's drawer on the applications page. */
export const applicationHref = (applicationId: string) =>
  `/applications?app=${encodeURIComponent(applicationId)}`;

function describeEvent(event: ActivityEvent): Pick<TimelineItem, "icon" | "tone"> & { lead: string; extra?: string } {
  if (event.kind === "message") {
    return { icon: "mail", tone: "info", lead: "New message about", extra: event.subject };
  }
  const copy = STAGE_COPY[event.stage];
  if (event.first) {
    return {
      icon: "send",
      tone: "neutral",
      lead: "You applied to",
      extra: event.confirmed ? "Confirmation emailed" : undefined,
    };
  }
  return { icon: copy.icon, tone: copy.tone, lead: `${copy.headline}:` };
}

/**
 * "Recent updates": what has happened across the candidate's latest applications,
 * newest first. Reads the history and messages of the ten most recently active ones —
 * a bounded fan-out, and the ones a person checks on are the recent ones anyway.
 */
export function ActivityFeed({ applications }: { applications: readonly Application[] }) {
  const ids = applications.map((application) => application.id);
  const histories = useHistories(ids);
  const messages = useNotificationsFor(ids);
  const jobs = useJobsByIds(applications.map((application) => application.job_id));

  const events = buildActivity(
    applications.map((application) => ({
      application,
      history: histories.byId.get(application.id),
      notifications: messages.byId.get(application.id),
    })),
  );
  const loading = histories.isLoading || messages.isLoading;

  const items: TimelineItem[] = events.map((event) => {
    const { icon, tone, lead, extra } = describeEvent(event);
    const title = jobs.byId.get(event.jobId)?.title ?? (jobs.isLoading ? "…" : UNLISTED_JOB);
    return {
      id: event.id,
      icon,
      tone,
      title: (
        <>
          {lead}{" "}
          <Link to={applicationHref(event.applicationId)} className="candidate-feed-link">
            {title}
          </Link>
        </>
      ),
      body: extra && <span className="candidate-feed-extra">{extra}</span>,
      meta: (
        <time dateTime={event.at} title={formatDateTime(event.at)}>
          {formatRelative(event.at)}
        </time>
      ),
    };
  });

  return (
    <Card padding="none" className="candidate-card">
      <CardHeader
        title="Recent updates"
        icon="activity"
        description="Moves and messages across your latest applications."
        actions={
          <ButtonLink to="/applications" variant="ghost" size="sm" rightIcon="arrow-right">
            All applications
          </ButtonLink>
        }
      />
      <div className="candidate-card-body">
        {loading && items.length === 0 ? (
          <SkeletonText lines={4} />
        ) : items.length > 0 ? (
          <Timeline items={items} aria-label="Recent updates" className="candidate-feed" />
        ) : (
          <EmptyState
            compact
            icon="bell"
            title="Nothing new yet"
            description="When a hiring team moves one of your applications, you'll see it here."
          />
        )}
      </div>
    </Card>
  );
}
