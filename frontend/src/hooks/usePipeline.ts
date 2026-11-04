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
import { keys, useCandidatesByIds, useJobApplications } from "./queries";

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

/**
 * A stage change that shows up before the server answers. The card moves at once; if
 * the server refuses (someone else moved it first, say) the board snaps back to what
 * it was and the caller shows the reason.
 */
export function useMoveApplication(jobId: string) {
  const client = useQueryClient();
  const listKey = keys.jobApplications(jobId);

  return useMutation({
    mutationFn: ({ id, stage, note }: MoveVariables) => applicationsApi.advance(id, stage, note),
    onMutate: async ({ id, stage }) => {
      // An in-flight poll landing after this would put the card back where it was.
      await client.cancelQueries({ queryKey: listKey });
      const previous = client.getQueryData<Page<Application>>(listKey);
      if (previous) client.setQueryData(listKey, withStage(previous, id, stage));
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) client.setQueryData(listKey, context.previous);
    },
    onSuccess: (application) => {
      client.setQueryData(keys.application(application.id), application);
    },
    // Counts, history and notifications all moved with it.
    onSettled: () => client.invalidateQueries({ queryKey: keys.applications }),
  });
}
