/**
 * The invited recruiter's side of an invitation: who the link is for, then choosing a
 * password. Both run signed out, with the token in the request body.
 */

import { useMutation, useQuery } from "@tanstack/react-query";
import { useId } from "react";

import { authApi } from "../api/resources";

/**
 * Not refetched while the page is open (staleTime), and dropped from the cache the
 * moment the page closes (gcTime). The key leaves the token out — it is as good as a
 * password until used, and query keys show up in devtools and error reports — and
 * names the page instance instead, whose token never changes.
 * `enabled` waits for the auth state: a signed-in visitor is asked to sign out first.
 */
export function useInvitationPreview(token: string, { enabled }: { enabled: boolean }) {
  // Per page instance, so a page started over for a new link never reads the last
  // link's answer from the cache.
  const instance = useId();
  return useQuery({
    queryKey: ["invitation-preview", instance],
    queryFn: () => authApi.previewInvitation(token),
    enabled: enabled && token !== "",
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });
}

/** Answers with a token pair: the recruiter is signed in, no second password prompt. */
export function useAcceptInvitation() {
  return useMutation({
    mutationFn: ({ token, password }: { token: string; password: string }) =>
      authApi.acceptInvitation(token, password),
  });
}
