import type { DragEvent, MouseEvent } from "react";

import { TERMINAL_STAGES, type Application, type ApplicationStage, type Candidate, type Job } from "../../api/types";
import {
  Avatar,
  DropdownMenu,
  Icon,
  IconButton,
  ScoreRing,
  Skeleton,
  StagePill,
  cx,
  formatDateTime,
  formatRelative,
  skillMatch,
  type MenuEntry,
} from "../ui";
import { recruiterTargets } from "../applications/stages";
import { applicantName, moveLabel } from "./model";
import { stageChangeAnchor } from "./useStageChange";

/** How many matched skills a card spells out before summarising the rest. */
const CARD_SKILLS = 3;

export interface PipelineCardProps {
  application: Application;
  candidate: Candidate | undefined;
  job: Job;
  pending: boolean;
  dragging: boolean;
  onOpen: (application: Application) => void;
  onRequestMove: (application: Application, stage: ApplicationStage) => void;
  onDragStart: (application: Application, event: DragEvent<HTMLLIElement>) => void;
  onDragEnd: () => void;
}

/**
 * One applicant on the board. A click anywhere on the card opens the drawer; from the
 * keyboard the name is that control, and the "Move to…" menu does what dragging does.
 */
export function PipelineCard({
  application,
  candidate,
  job,
  pending,
  dragging,
  onOpen,
  onRequestMove,
  onDragStart,
  onDragEnd,
}: PipelineCardProps) {
  const name = applicantName(candidate);
  const targets = recruiterTargets(application.stage);
  const movable = !TERMINAL_STAGES.has(application.stage) && !pending;
  const { matched, missing } = skillMatch(candidate?.skills, job.required_skills);

  function handleClick(event: MouseEvent<HTMLLIElement>) {
    // The name and the menu do their own thing. (A whole-card overlay link would be
    // simpler, but Firefox will not start a drag from a button.)
    if ((event.target as HTMLElement).closest("button, a, [role='menu']")) return;
    onOpen(application);
  }

  const menu: MenuEntry[] = [
    ...(targets.length > 0 ? [{ type: "label" as const, label: "Move to" }] : []),
    ...targets.map(
      (stage): MenuEntry => ({
        label: moveLabel(stage),
        icon: stage === "rejected" ? "x-circle" : "arrow-right",
        danger: stage === "rejected",
        disabled: pending,
        onSelect: () => onRequestMove(application, stage),
      }),
    ),
    ...(targets.length > 0 ? [{ type: "separator" as const }] : []),
    { label: "Open details", icon: "eye", onSelect: () => onOpen(application) },
  ];

  return (
    <li
      className={cx("pipeline-card", dragging && "is-dragging", pending && "is-pending")}
      draggable={movable}
      onDragStart={(event) => onDragStart(application, event)}
      onDragEnd={onDragEnd}
      onClick={handleClick}
      aria-busy={pending || undefined}
    >
      <div className="pipeline-card-top">
        <Avatar name={name} size="sm" />
        <div className="pipeline-card-who">
          {candidate ? (
            <button type="button" className="pipeline-card-name" onClick={() => onOpen(application)}>
              {name}
            </button>
          ) : (
            <Skeleton width="7rem" />
          )}
          {candidate?.headline && <span className="pipeline-card-headline">{candidate.headline}</span>}
        </div>
        <ScoreRing score={application.match_score} size={32} strokeWidth={3} />
      </div>

      {(matched.length > 0 || missing.length > 0) && (
        <div className="pipeline-card-skills">
          {matched.slice(0, CARD_SKILLS).map((skill) => (
            <span key={skill} className="tag match">
              <Icon name="check" size={12} />
              {skill}
              <span className="sr-only"> (matched)</span>
            </span>
          ))}
          {matched.length > CARD_SKILLS && <span className="tag">+{matched.length - CARD_SKILLS}</span>}
          {missing.length > 0 && (
            <span className="tag missing" title={`Missing: ${missing.join(", ")}`}>
              {missing.length} missing
              <span className="sr-only">: {missing.join(", ")}</span>
            </span>
          )}
        </div>
      )}

      <div className="pipeline-card-foot">
        {TERMINAL_STAGES.has(application.stage) && application.stage !== "hired" ? (
          <StagePill stage={application.stage} />
        ) : (
          <time dateTime={application.created_at} title={`Applied ${formatDateTime(application.created_at)}`}>
            {formatRelative(application.created_at)}
          </time>
        )}
        <DropdownMenu
          align="end"
          items={menu}
          aria-label={`Actions for ${name}`}
          trigger={(props) => (
            <IconButton
              {...props}
              {...stageChangeAnchor(application.id)}
              icon="more-horizontal"
              size="sm"
              aria-label={`Move ${name} or open details`}
              className="pipeline-card-menu"
            />
          )}
        />
      </div>
    </li>
  );
}
