import { TERMINAL_STAGES, type Application, type ApplicationStage } from "../../api/types";
import { useAdvanceStage } from "../../hooks/queries";
import { describeMove } from "../pipeline/model";
import { Button, DropdownMenu, IconButton, humanize, useToast, type MenuEntry } from "../ui";
import { forwardStage, recruiterTargets } from "./stages";
import { useRescore } from "./useRescore";
import { useStageMove } from "./useStageMove";

export interface ApplicationActionsProps {
  application: Application;
  candidateName: string;
  jobTitle: string;
  /** Leave out the link to the page the actions already sit on. */
  hideCandidateLink?: boolean;
  /** The row is a leftover from the previous view while the next one loads. */
  disabled?: boolean;
  /** Opens the application in place (the queue's drawer): the menu's way to do what a
   * row click does, for keyboard users. */
  onOpen?: () => void;
}

/**
 * A recruiter's moves for one application: a step forward (one click, except a hire,
 * which is confirmed), and a menu for everything else — moving with a note, rejecting,
 * re-running scoring, and the pages that give more context. Confirmed moves use the
 * pipeline's dialog, so a rejection reads the same here as on the board. Only
 * transitions the server allows are ever offered.
 */
export function ApplicationActions({
  application,
  candidateName,
  jobTitle,
  hideCandidateLink = false,
  disabled = false,
  onOpen,
}: ApplicationActionsProps) {
  const move = useStageMove();
  const advance = useAdvanceStage();
  const { rescore, isPending: rescoring } = useRescore();
  const toast = useToast();

  const next = forwardStage(application.stage);
  const targets = recruiterTargets(application.stage);
  const forwardTargets = targets.filter((target) => target !== "rejected");

  function advanceNow(stage: ApplicationStage) {
    advance.mutate(
      { id: application.id, stage },
      {
        onSuccess: () =>
          toast.success(describeMove(candidateName, stage), { description: jobTitle }),
        onError: (error) => toast.error(error),
      },
    );
  }

  const openDialog = (stage: ApplicationStage) =>
    move.requestMove({ application, stage, candidateName, jobTitle });

  const items: MenuEntry[] = [];
  if (targets.length > 0) {
    items.push({ type: "label", label: "Move with a note" });
    for (const target of forwardTargets) {
      items.push({
        label: humanize(target),
        icon: "arrow-right",
        onSelect: () => openDialog(target),
      });
    }
    if (targets.includes("rejected")) {
      items.push({
        label: "Reject…",
        icon: "x-circle",
        danger: true,
        onSelect: () => openDialog("rejected"),
      });
    }
    items.push({ type: "separator" });
  }
  items.push({
    label: "Re-run scoring",
    icon: "refresh",
    disabled: rescoring,
    onSelect: () => rescore(application.id),
  });
  items.push({ type: "separator" });
  if (onOpen) {
    items.push({ label: "Open details", icon: "eye", onSelect: onOpen });
  }
  if (!hideCandidateLink) {
    items.push({ label: "Open candidate", icon: "user", to: `/candidates/${application.candidate_id}` });
  }
  items.push(
    { label: "Open job pipeline", icon: "kanban", to: `/jobs/${application.job_id}/pipeline` },
    { label: "Open job", icon: "briefcase", to: `/jobs/${application.job_id}` },
  );

  return (
    // The menu and dialog render in portals, but React still bubbles their clicks
    // through this tree — up to a clickable table row, which would navigate away.
    <div className="apps-actions" onClick={(event) => event.stopPropagation()}>
      {next && (
        <Button
          size="sm"
          rightIcon="arrow-right"
          loading={advance.isPending}
          disabled={disabled}
          // Hiring cannot be undone, so it is confirmed like a rejection; the earlier
          // steps stay one click.
          onClick={(event) => {
            // The moved row leaves its tab and the next row's button slides under the
            // pointer, so the second click of a double-click would move someone else.
            if (event.detail > 1) return;
            if (TERMINAL_STAGES.has(next)) openDialog(next);
            else advanceNow(next);
          }}
        >
          {/* Short on screen to fit a table cell; complete for a screen reader. */}
          <span className="sr-only">Move to </span>
          {humanize(next)}
        </Button>
      )}
      <DropdownMenu
        align="end"
        items={items}
        trigger={(props) => (
          <IconButton
            {...props}
            icon="more-horizontal"
            size="sm"
            disabled={disabled}
            aria-label={`More actions for ${candidateName}, ${jobTitle}`}
          />
        )}
      />
      {move.dialog}
    </div>
  );
}
