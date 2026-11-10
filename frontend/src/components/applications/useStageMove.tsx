import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import type { Application, ApplicationStage } from "../../api/types";
import { useAdvanceStage } from "../../hooks/queries";
import { describeMove } from "../pipeline/model";
import { StageChangeDialog } from "../pipeline/StageChangeDialog";
import { describeError, useToast } from "../ui";
import { recruiterTargets } from "./stages";

export interface StageMoveRequest {
  application: Application;
  /** Preselected in the dialog; the recruiter can still pick another allowed stage. */
  stage: ApplicationStage;
  candidateName: string;
  jobTitle: string;
}

export interface StageMove {
  requestMove: (request: StageMoveRequest) => void;
  /** Render it once, inside whatever the move was started from. */
  dialog: ReactNode;
}

/**
 * Moving an application from a screen that spans jobs: the queue, a candidate's page.
 * It confirms with the same dialog as the per-job screens (useStageChange), so a move
 * reads the same everywhere. It is not optimistic, because these screens do not read
 * the one job's cache that useStageChange updates early. The dialog stays open until the
 * server answers — Escape and the close button wait too — and shows a refusal in place.
 * Should the recruiter have left the page by then, the refusal is toasted instead: a
 * move that did not happen must never pass silently.
 */
export function useStageMove(): StageMove {
  const toast = useToast();
  const [request, setRequest] = useState<StageMoveRequest | null>(null);
  // The dialog showing now, and whether this screen still is — for an answer that
  // arrives after the recruiter left the page (the dialog itself cannot be closed while
  // the move is in flight).
  const shown = useRef<StageMoveRequest | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    shown.current = request;
  }, [request]);
  useEffect(() => {
    // Set in the effect, not only at creation: StrictMode runs every effect's cleanup
    // and then the effect again on mount, and a ref set true only once would stay
    // false from then on — every refusal toasted on top of the dialog showing it.
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const advance = useAdvanceStage({
    onError: (error, variables) => {
      // Still on screen: the dialog shows the refusal in place.
      if (mounted.current && shown.current?.application.id === variables.id) return;
      const { title, message } = describeError(error);
      toast.error(title, {
        description: `${message} ${variables.candidateName ?? "The applicant"} was not moved.`,
      });
    },
  });

  const { reset } = advance;
  const requestMove = useCallback(
    (next: StageMoveRequest) => {
      // A refusal belongs to the move it answered, not to the next dialog.
      reset();
      setRequest(next);
    },
    [reset],
  );

  function confirm(note: string, stage: ApplicationStage) {
    if (!request) return;
    const { application, candidateName, jobTitle } = request;
    advance.mutate(
      { id: application.id, stage, note: note || undefined, candidateName },
      {
        onSuccess: () => {
          toast.success(describeMove(candidateName, stage), {
            description: note ? `Note: ${note}` : jobTitle,
          });
          setRequest(null);
        },
      },
    );
  }

  const dialog = request && (
    <StageChangeDialog
      key={`${request.application.id}:${request.stage}`}
      request={{
        applicationId: request.application.id,
        candidateName: request.candidateName,
        jobTitle: request.jobTitle,
        from: request.application.stage,
        to: request.stage,
      }}
      targets={recruiterTargets(request.application.stage)}
      pending={advance.isPending}
      error={advance.error}
      onCancel={() => setRequest(null)}
      onConfirm={confirm}
    />
  );

  return { requestMove, dialog };
}
