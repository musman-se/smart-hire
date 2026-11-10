/**
 * Query hooks for the admin's team page. Every mutation invalidates the "team" prefix:
 * a status is derived by the server (deactivated, invited, active), so the row is
 * re-read rather than patched here and risk showing a status the server would not.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { teamApi } from "../api/resources";
import type { RecruiterInvite } from "../api/types";
import { keys } from "./queries";

export function useTeam(filters: { limit: number; offset: number }) {
  return useQuery({
    queryKey: keys.teamList(filters),
    queryFn: () => teamApi.list(filters),
    placeholderData: (previous) => previous,
  });
}

/** Adding a recruiter answers with their invitation token, shown once. No
 * Idempotency-Key: a retried add is refused as duplicate_email, never doubled. */
export function useInviteRecruiter() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: RecruiterInvite) => teamApi.invite(payload),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.team }),
  });
}

/** A new link for someone still invited; the old one stops working. The row's expiry
 * changes, so the list is re-read. */
export function useReissueInvitation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => teamApi.reissueInvitation(id),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.team }),
  });
}

/** deactivate / reactivate share a shape, so they share a hook. */
export function useStaffAccess() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: "deactivate" | "reactivate" }) =>
      teamApi[action](id),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.team }),
  });
}
