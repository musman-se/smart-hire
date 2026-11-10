import { useMutationState } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { Application, ApplicationStage } from "../../api/types";
import { moveMutationKey, useMoveApplication, type MoveVariables } from "../../hooks/usePipeline";
import { focusIsLost } from "../../hooks/useTableFocusHandoff";
import { describeError, humanize, useToast } from "../ui";
import { describeMove } from "./model";
import { StageChangeDialog, type StageChangeRequest } from "./StageChangeDialog";

export interface StageChange {
  /** Opens the confirmation for moving `application` to `stage`. */
  requestMove: (application: Application, stage: ApplicationStage) => void;
  /** Render it once, anywhere on the page. */
  dialog: ReactNode;
  /** Every application whose move is in flight, so each card can show it — moves
   * overlap when a second card is moved before the first answers. */
  pendingIds: ReadonlySet<string>;
}

const ANCHOR_ATTRIBUTE = "data-stage-change-anchor";

/**
 * Marks the control that takes focus once an application has moved — on the board, the
 * card's "Move to…" button. Spread it onto that element.
 */
export function stageChangeAnchor(applicationId: string) {
  return { [ANCHOR_ATTRIBUTE]: applicationId };
}

/** A move whose card may still be re-rendered somewhere else: by the early update, and
 * again by a rollback if the server refuses. */
interface Landing {
  applicationId: string;
  settled: boolean;
}

/**
 * Every way of moving an application — a drop on the board, the "Move to…" menu, the
 * drawer's buttons — goes through here, so they confirm, update optimistically and
 * report the outcome the same way. Toasts are announced politely, which is how a
 * keyboard or screen-reader user learns the move landed.
 *
 * A card that changes column is a new element, so the control the dialog would hand
 * focus back to is gone and focus would drop to the page. Focus follows the card
 * instead, to its anchor (see stageChangeAnchor), so a keyboard user carries on from it.
 */
export function useStageChange(jobId: string, nameOf: (application: Application) => string): StageChange {
  const move = useMoveApplication(jobId);
  const toast = useToast();
  const [request, setRequest] = useState<StageChangeRequest | null>(null);
  const landing = useRef<Landing | null>(null);
  const pendingList = useMutationState({
    filters: { mutationKey: moveMutationKey(jobId), status: "pending" },
    select: (mutation) => (mutation.state.variables as MoveVariables | undefined)?.id,
  });
  const pendingKey = pendingList.filter(Boolean).join(",");
  const pendingIds = useMemo(
    () => new Set(pendingKey ? pendingKey.split(",") : []),
    [pendingKey],
  );

  // Runs after every render of the page: the card moves in whichever render the cache
  // update lands in, and this hook cannot tell which one that is.
  useEffect(() => {
    const current = landing.current;
    if (!current) return;
    if (focusIsLost()) findAnchor(current.applicationId)?.focus();
    if (current.settled) landing.current = null;
  });

  // Stable, so tables can memoise the columns that call it.
  const requestMove = useCallback(
    (application: Application, stage: ApplicationStage) =>
      setRequest({
        applicationId: application.id,
        candidateName: nameOf(application),
        from: application.stage,
        to: stage,
      }),
    [nameOf],
  );

  function confirm(note: string) {
    if (!request) return;
    const { applicationId, candidateName, from, to } = request;
    setRequest(null);
    const current: Landing = { applicationId, settled: false };
    landing.current = current;
    move.mutate(
      { id: applicationId, stage: to, note: note || undefined },
      {
        onSuccess: () =>
          toast.success(describeMove(candidateName, to), {
            description: note ? `Note: ${note}` : undefined,
          }),
        // The server's reason first, then what the board did about it: the card is back.
        onError: (error) => {
          const { title, message } = describeError(error);
          toast.error(title, {
            description: `${message} ${candidateName} is back in ${humanize(from)}.`,
          });
        },
        // The render that follows is the last one this move can cause.
        onSettled: () => {
          current.settled = true;
        },
      },
    );
  }

  const dialog = request && (
    <StageChangeDialog
      key={`${request.applicationId}:${request.to}`}
      request={request}
      onCancel={() => setRequest(null)}
      onConfirm={confirm}
    />
  );

  return {
    requestMove,
    dialog,
    pendingIds,
  };
}

function findAnchor(applicationId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[${ANCHOR_ATTRIBUTE}="${CSS.escape(applicationId)}"]`);
}
