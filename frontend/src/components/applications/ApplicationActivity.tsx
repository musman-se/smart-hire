import type { ApplicationStage } from "../../api/types";
import { useApplicationHistory, useApplicationNotifications } from "../../hooks/queries";
import {
  EmptyState,
  ErrorNotice,
  SkeletonText,
  StageStepper,
  Timeline,
  formatDateTime,
  formatRelative,
  humanize,
  stoppedAt,
  type TimelineItem,
} from "../ui";
import { buildActivity, type ActivityEvent } from "./stages";

const STAGE_TONE: Partial<Record<ApplicationStage, TimelineItem["tone"]>> = {
  hired: "success",
  offer: "success",
  rejected: "danger",
  withdrawn: "warning",
};

function toTimelineItem(event: ActivityEvent): TimelineItem {
  const when = (
    <time dateTime={event.at} title={formatDateTime(event.at)}>
      {formatRelative(event.at)}
    </time>
  );
  if (event.kind === "message") {
    return {
      id: event.id,
      icon: "mail",
      tone: "info",
      title: event.subject,
      meta: (
        <>
          {humanize(event.channel)} to {event.recipient} · {when}
        </>
      ),
      body: <p className="prewrap apps-activity-message">{event.body}</p>,
    };
  }
  return {
    id: event.id,
    icon:
      event.to === "hired" ? "award" : event.to === "rejected" ? "x-circle" : event.from ? "arrow-right" : "send",
    tone: STAGE_TONE[event.to] ?? "accent",
    title: event.from ? `Moved to ${humanize(event.to)}` : "Applied",
    meta: event.from ? (
      <>
        From {humanize(event.from)} · {when}
      </>
    ) : (
      when
    ),
    body: event.note ? <p className="timeline-note prewrap">“{event.note}”</p> : undefined,
  };
}

/**
 * Everything that happened to one application — stage moves with the recruiter's
 * notes, and the messages sent to the candidate — read when the panel is opened.
 */
export function ApplicationActivity({
  applicationId,
  stage,
}: {
  applicationId: string;
  stage: ApplicationStage;
}) {
  const history = useApplicationHistory(applicationId, true);
  const notifications = useApplicationNotifications(applicationId, true);

  if (history.isLoading || notifications.isLoading) return <SkeletonText lines={4} />;
  if (history.error) return <ErrorNotice error={history.error} />;

  const events = buildActivity(history.data ?? [], notifications.data ?? []);

  return (
    <div className="stack-sm">
      <StageStepper stage={stage} stoppedAt={stoppedAt(history.data)} />
      {/* Messages are a nice-to-have next to the history; a failure there is not fatal. */}
      <ErrorNotice error={notifications.error} />
      {events.length === 0 ? (
        <EmptyState compact icon="activity" title="No activity recorded yet" />
      ) : (
        <Timeline items={events.map(toTimelineItem)} aria-label="Application activity" />
      )}
    </div>
  );
}
