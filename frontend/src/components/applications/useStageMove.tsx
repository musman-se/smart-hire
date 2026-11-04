import { useCallback, useState, type ReactNode } from "react";

import type { Application, ApplicationStage } from "../../api/types";
import { useAdvanceStage } from "../../hooks/queries";
import { describeMove } from "../pipeline/model";
import { StageChangeDialog } from "../pipeline/StageChangeDialog";
import { useToast } from "../ui";
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
 * server answers and shows a refusal in place.
 */
export function useStageMove(): StageMove {
  const advance = useAdvanceStage();
  const toast = useToast();
  const [request, setRequest] = useState<StageMoveRequest | null>(null);

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
      { id: application.id, stage, note: note || undefined },
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
