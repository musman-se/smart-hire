import type { Application, ApplicationStage, Job } from "../../api/types";
import {
  Badge,
  DropdownMenu,
  Icon,
  IconButton,
  StageStepper,
  formatDateTime,
  formatRelative,
  type MenuEntry,
} from "../ui";
import { isActive } from "./applications";
import { CandidateStagePill } from "./CandidateStagePill";
import { JobMeta } from "./JobMeta";
import { JobTitle } from "./JobTitle";
import { STAGE_COPY } from "./stageCopy";

export interface ApplicationCardProps {
  application: Application;
  job: Job | undefined;
  jobLoading: boolean;
  /** For a closed application: where it stopped (see stoppedAt in applications.ts). */
  stoppedAt?: ApplicationStage | null;
  /** Markers-only stepper, for narrow screens. */
  compact?: boolean;
  withdrawing?: boolean;
  onOpen: () => void;
  onWithdraw: () => void;
}

/** One application in the candidate's list: what it is, where it stands, what's next. */
export function ApplicationCard({
  application,
  job,
  jobLoading,
  stoppedAt,
  compact,
  withdrawing,
  onOpen,
  onWithdraw,
}: ApplicationCardProps) {
  const copy = STAGE_COPY[application.stage];
  const active = isActive(application);
  const jobClosed = job?.status === "closed";

  const menu: MenuEntry[] = [
    { label: "View details", icon: "file-text", onSelect: onOpen },
    ...(job ? [{ label: "View job posting", icon: "briefcase" as const, to: `/jobs/${job.id}` }] : []),
    ...(active
      ? [
          { type: "separator" as const },
          {
            label: "Withdraw application",
            icon: "x-circle" as const,
            danger: true,
            disabled: withdrawing,
            onSelect: onWithdraw,
          },
        ]
      : []),
  ];
  // Named per card, so a screen reader's list of buttons can tell them apart.
  const actionsLabel = `Actions for ${job?.title ?? "this application"}`;

  return (
    <li className="candidate-app" data-active={active || undefined}>
      <div className="candidate-app-head">
        <div className="candidate-app-heading">
          <h3 className="candidate-app-title">
            <button type="button" className="candidate-app-open" onClick={onOpen} aria-haspopup="dialog">
              <JobTitle job={job} loading={jobLoading} />
            </button>
          </h3>
          {job && <JobMeta job={job} />}
        </div>
        <div className="candidate-app-badges">
          {jobClosed && (
            <Badge tone="neutral" size="sm" title="The role has stopped taking new applications">
              Role closed
            </Badge>
          )}
          <CandidateStagePill stage={application.stage} />
          <DropdownMenu
            align="end"
            aria-label={actionsLabel}
            items={menu}
            trigger={(props) => (
              <IconButton {...props} icon="more-horizontal" size="sm" aria-label={actionsLabel} />
            )}
          />
        </div>
      </div>

      <StageStepper
        stage={application.stage}
        stoppedAt={stoppedAt}
        compact={compact}
        className="candidate-app-stepper"
      />

      <div className="candidate-app-foot">
        <p className="candidate-app-status" data-tone={copy.tone}>
          <Icon name={copy.icon} size={14} />
          <span>
            <strong>{copy.headline}.</strong> {copy.next}
          </span>
        </p>
        <p className="candidate-app-dates">
          <span title={formatDateTime(application.created_at)}>
            Applied <time dateTime={application.created_at}>{formatRelative(application.created_at)}</time>
          </span>
          {application.updated_at !== application.created_at && (
            <span title={formatDateTime(application.updated_at)}>
              Updated <time dateTime={application.updated_at}>{formatRelative(application.updated_at)}</time>
            </span>
          )}
        </p>
      </div>
    </li>
  );
}
