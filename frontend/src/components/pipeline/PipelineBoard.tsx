import { useState, type DragEvent } from "react";

import type { Application, ApplicationStage, Candidate, Job } from "../../api/types";
import { Icon, cx, formatNumber, humanize, pluralize } from "../ui";
import { recruiterTargets } from "../applications/stages";
import { BOARD_COLUMNS, applicantName, canDrop, stageForColumn, type BoardColumn } from "./model";
import { PipelineCard } from "./PipelineCard";

export interface PipelineBoardProps {
  job: Job;
  /** The applications to show, already filtered and ordered, per column. */
  columns: Record<BoardColumn, Application[]>;
  /** Every loaded application per column, before filtering — for "3/7". */
  totals: Record<BoardColumn, number>;
  /** Server totals per column when the board holds only the latest page; undefined when
   * it holds everything. Without them a column of 37 would read as the whole backlog. */
  serverTotals?: Partial<Record<BoardColumn, number>>;
  candidatesById: ReadonlyMap<string, Candidate>;
  showClosed: boolean;
  onShowClosedChange: (open: boolean) => void;
  pendingId: string | undefined;
  onOpen: (application: Application) => void;
  onRequestMove: (application: Application, stage: ApplicationStage) => void;
}

const COLUMN_HINTS: Record<BoardColumn, string> = {
  applied: "New applications land here.",
  screening: "Nobody is being screened.",
  interview: "No interviews in progress.",
  offer: "No offers out.",
  hired: "No hires yet.",
  closed: "Rejected and withdrawn applications.",
};

/**
 * The hiring board. Dragging uses native HTML5 drag and drop: while a card is held,
 * only the stages it may move to accept it (the rest dim), and a drop asks for
 * confirmation rather than moving at once. Everything a drag does, the card's menu
 * does from the keyboard too.
 */
export function PipelineBoard({
  job,
  columns,
  totals,
  serverTotals,
  candidatesById,
  showClosed,
  onShowClosedChange,
  pendingId,
  onOpen,
  onRequestMove,
}: PipelineBoardProps) {
  const [dragged, setDragged] = useState<Application | null>(null);
  const [over, setOver] = useState<BoardColumn | null>(null);
  const [announcement, setAnnouncement] = useState("");

  function startDrag(application: Application, event: DragEvent<HTMLLIElement>) {
    event.dataTransfer.effectAllowed = "move";
    // Firefox starts no drag without data.
    event.dataTransfer.setData("text/plain", application.id);
    setDragged(application);
    const targets = recruiterTargets(application.stage).map(humanize).join(" or ");
    setAnnouncement(`Picked up ${applicantName(candidatesById.get(application.candidate_id))}. Drop on ${targets}.`);
  }

  function endDrag() {
    setDragged(null);
    setOver(null);
  }

  function dropState(column: BoardColumn): "valid" | "invalid" | "over" | undefined {
    if (!dragged) return undefined;
    if (!canDrop(dragged.stage, column)) return "invalid";
    return over === column ? "over" : "valid";
  }

  function handleDragOver(column: BoardColumn, event: DragEvent<HTMLElement>) {
    if (!dragged || !canDrop(dragged.stage, column)) return;
    // Accepting the drop is what preventDefault means here.
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (over !== column) setOver(column);
  }

  function handleDragLeave(column: BoardColumn, event: DragEvent<HTMLElement>) {
    // Moving between a column's own children fires leave too; only leaving it counts.
    if (over === column && !event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(null);
  }

  function handleDrop(column: BoardColumn, event: DragEvent<HTMLElement>) {
    event.preventDefault();
    const application = dragged;
    endDrag();
    if (application && canDrop(application.stage, column)) onRequestMove(application, stageForColumn(column));
  }

  return (
    <>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <div className="pipeline-board" data-dragging={dragged ? "" : undefined}>
        {BOARD_COLUMNS.map((column) => {
          const items = columns[column];
          const collapsed = column === "closed" && !showClosed;
          const filtered = items.length !== totals[column];
          const serverTotal = serverTotals?.[column];
          const partial = serverTotal !== undefined && serverTotal > totals[column];
          const headingId = `pipeline-col-${column}`;

          return (
            <section
              key={column}
              className={cx("pipeline-column", collapsed && "is-collapsed")}
              data-stage={column}
              data-drop={dropState(column)}
              aria-labelledby={headingId}
              onDragOver={(event) => handleDragOver(column, event)}
              onDragLeave={(event) => handleDragLeave(column, event)}
              onDrop={(event) => handleDrop(column, event)}
            >
              <header className="pipeline-column-header">
                <span className="pipeline-column-dot" aria-hidden="true" />
                <h2 id={headingId} className="pipeline-column-title">
                  {column === "closed" ? "Closed" : humanize(column)}
                </h2>
                <span
                  className="pipeline-column-count"
                  title={partial ? "Only the latest applications are on the board" : undefined}
                >
                  <span aria-hidden="true">
                    {filtered
                      ? `${formatNumber(items.length)}/${formatNumber(totals[column])}`
                      : partial
                        ? `${formatNumber(items.length)} of ${formatNumber(serverTotal)}`
                        : formatNumber(items.length)}
                  </span>
                  <span className="sr-only">
                    {countLabel(items.length, totals[column], partial ? serverTotal : undefined)}
                  </span>
                </span>
                {column === "closed" && (
                  <button
                    type="button"
                    className="pipeline-column-toggle"
                    aria-expanded={showClosed}
                    aria-label={showClosed ? "Collapse the closed lane" : "Expand the closed lane"}
                    onClick={() => onShowClosedChange(!showClosed)}
                  >
                    <Icon name={showClosed ? "chevrons-right" : "chevrons-left"} size={14} />
                  </button>
                )}
              </header>

              {dropState(column) && dropState(column) !== "invalid" && (
                <p className="pipeline-drop-hint" aria-hidden="true">
                  {column === "closed" ? "Drop to reject" : `Drop to move to ${humanize(column)}`}
                </p>
              )}

              {!collapsed &&
                (items.length > 0 ? (
                  <ol className="pipeline-cards" aria-labelledby={headingId}>
                    {items.map((application) => (
                      <PipelineCard
                        key={application.id}
                        application={application}
                        candidate={candidatesById.get(application.candidate_id)}
                        job={job}
                        pending={pendingId === application.id}
                        dragging={dragged?.id === application.id}
                        onOpen={onOpen}
                        onRequestMove={onRequestMove}
                        onDragStart={startDrag}
                        onDragEnd={endDrag}
                      />
                    ))}
                  </ol>
                ) : (
                  <p className="pipeline-column-empty">{filtered ? "No matches here." : COLUMN_HINTS[column]}</p>
                ))}
            </section>
          );
        })}
      </div>
    </>
  );
}

/** The column count in words; `serverTotal` is set only when the board holds part of
 * the column. */
function countLabel(shown: number, loaded: number, serverTotal: number | undefined): string {
  const outOf = serverTotal === undefined ? "" : ` (${formatNumber(serverTotal)} in this stage in all)`;
  if (shown !== loaded) return `${formatNumber(shown)} of ${pluralize(loaded, "application")} on the board match${outOf}`;
  if (serverTotal !== undefined) return `${formatNumber(shown)} of ${pluralize(serverTotal, "application")} shown (latest only)`;
  return pluralize(shown, "application");
}
