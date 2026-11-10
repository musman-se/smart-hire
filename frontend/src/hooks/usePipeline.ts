/**
 * Query hooks for one job's applicants — the pipeline board, the applicants table and
 * the candidate drawer all read the same cache entry (keys.jobApplications), so a move
 * made in one shows in the others at once.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { applicationsApi } from "../api/resources";
import type { Application, ApplicationStage, Page } from "../api/types";
import { withStage } from "../components/pipeline/model";
import { invalidateAllBut, keys, useCandidatesByIds, useJobApplications } from "./queries";

/** A job's latest 100 applications, with each applicant's profile resolved by id.
 * Recruiters only: both endpoints are theirs. */
export function useJobApplicants(jobId: string) {
  const applications = useJobApplications(jobId);
  const items = applications.data?.items;
  const candidateIds = useMemo(() => items?.map((a) => a.candidate_id) ?? [], [items]);
  const candidates = useCandidatesByIds(candidateIds);

  return {
    applications,
    candidatesById: candidates.byId,
    candidatesLoading: candidates.isLoading,
  };
}

export interface MoveVariables {
  id: string;
  stage: ApplicationStage;
  note?: string;
}

/** Every move on one job's applicants shares this key, so in-flight moves can be found
 * (useStageChange's pending markers) and counted (the refresh below). */
export const moveMutationKey = (jobId: string) => ["applications", "move", jobId] as const;

/**
 * A stage change that shows up before the server answers. The card moves at once; if
 * the server refuses (someone else moved it first, say) that card snaps back to where
 * it was and the caller shows the reason.
 *
 * Moves can overlap — a second card dragged before the first answers — so a refusal
 * puts back only its own card, and only if nothing has moved it since; restoring a
 * snapshot of the whole list would also undo the other move.
 */
export function useMoveApplication(jobId: string) {
  const client = useQueryClient();
  const listKey = keys.jobApplications(jobId);

  return useMutation({
    mutationKey: moveMutationKey(jobId),
    mutationFn: ({ id, stage, note }: MoveVariables) => applicationsApi.advance(id, stage, note),
    onMutate: async ({ id, stage }) => {
      // An in-flight poll landing after this would put the card back where it was.
      await client.cancelQueries({ queryKey: listKey });
      const list = client.getQueryData<Page<Application>>(listKey);
      const from = list?.items.find((application) => application.id === id)?.stage;
      if (list) client.setQueryData(listKey, withStage(list, id, stage));
      return { from };
    },
    onError: (_error, { id, stage }, context) => {
      const from = context?.from;
      if (!from) return;
      client.setQueryData<Page<Application>>(listKey, (list) =>
        list?.items.some((application) => application.id === id && application.stage === stage)
          ? withStage(list, id, from)
          : list,
      );
    },
    onSuccess: (application) => {
      client.setQueryData(keys.application(application.id), application);
    },
    // Counts, history and notifications all moved with it. Only once the last of
    // several overlapping moves settles: a refetch while another is in flight would
    // put that card back in its old column until its own answer came. This one still
    // counts as in flight here, hence "1". The detail just written is not re-read.
    onSettled: (application) => {
      if (client.isMutating({ mutationKey: moveMutationKey(jobId) }) > 1) return;
      return application
        ? invalidateAllBut(client, keys.applications, keys.application(application.id))
        : client.invalidateQueries({ queryKey: keys.applications });
    },
  });
}
