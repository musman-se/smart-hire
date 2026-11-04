/**
 * The "Recent updates" feed: stage changes and messages from a candidate's
 * applications, merged into one newest-first stream.
 */

import type { Application, ApplicationStage, Notification, StageChange } from "../../api/types";

export interface ActivitySource {
  application: Pick<Application, "id" | "job_id">;
  history?: readonly StageChange[];
  notifications?: readonly Notification[];
}

export type ActivityEvent =
  | {
      kind: "stage";
      id: string;
      applicationId: string;
      jobId: string;
      at: string;
      stage: ApplicationStage;
      /** The application this event opened, i.e. the very first history entry. */
      first: boolean;
      /** For the first event: the confirmation email went out. */
      confirmed: boolean;
    }
  | {
      kind: "message";
      id: string;
      applicationId: string;
      jobId: string;
      at: string;
      subject: string;
    };

/**
 * Sent automatically the moment an application is created. Listed on its own it
 * would double every application in the feed, so it is folded into the "applied"
 * event instead ("…confirmation emailed").
 */
export const CONFIRMATION_KIND = "application_received";

export function buildActivity(sources: readonly ActivitySource[], limit = 8): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  for (const { application, history = [], notifications = [] } of sources) {
    const base = { applicationId: application.id, jobId: application.job_id };
    const confirmed = notifications.some((message) => message.kind === CONFIRMATION_KIND);
    history.forEach((change, index) => {
      const first = change.from_stage === null;
      events.push({
        ...base,
        kind: "stage",
        id: `${application.id}:stage:${index}`,
        at: change.changed_at,
        stage: change.to_stage,
        first,
        confirmed: first && confirmed,
      });
    });
    notifications.forEach((message, index) => {
      if (message.kind === CONFIRMATION_KIND) return;
      events.push({
        ...base,
        kind: "message",
        id: `${application.id}:message:${index}`,
        at: message.sent_at,
        subject: message.subject,
      });
    });
  }
  return events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, limit);
}
