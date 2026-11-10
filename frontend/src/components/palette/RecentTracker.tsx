import { useEffect } from "react";
import { matchPath, useLocation } from "react-router-dom";

import { ApiError } from "../../api/client";
import { useUser } from "../../auth/AuthProvider";
import { isStaff } from "../../auth/roles";
import { useCandidate, useJob } from "../../hooks/queries";
import { humanize } from "../ui";
import type { RecentItem, RecentItems, RecentKind } from "./recent";

type TrackerProps = Pick<RecentItems, "remember" | "forget">;

/**
 * Notes each job and candidate page the user opens, however they got there — a table
 * row, a link, the palette — so "Recent" means "what I was just looking at".
 *
 * It reads the same cached queries the page itself loads, so it costs no requests of
 * its own. A page that answers 404 (a deleted job, one a candidate can no longer see)
 * is dropped from the list rather than offered again.
 */
export function RecentTracker({ remember, forget }: TrackerProps) {
  const { pathname } = useLocation();
  const user = useUser();

  const jobId = matchPath("/jobs/:jobId", pathname)?.params.jobId;
  const candidateId = matchPath("/candidates/:candidateId", pathname)?.params.candidateId;

  // "/jobs/new" is the editor, not a job.
  if (jobId && jobId !== "new") {
    return <TrackJob id={jobId} remember={remember} forget={forget} />;
  }
  if (candidateId && isStaff(user.role)) {
    return <TrackCandidate id={candidateId} remember={remember} forget={forget} />;
  }
  return null;
}

interface TrackProps extends TrackerProps {
  id: string;
}

function useTrack(
  kind: RecentKind,
  { id, remember, forget }: TrackProps,
  found: Pick<RecentItem, "title" | "subtitle"> | undefined,
  error: unknown,
) {
  const title = found?.title;
  const subtitle = found?.subtitle;
  const missing = error instanceof ApiError && error.status === 404;

  useEffect(() => {
    if (title) remember({ kind, id, title, subtitle });
  }, [kind, id, title, subtitle, remember]);

  useEffect(() => {
    if (missing) forget({ kind, id });
  }, [kind, id, missing, forget]);
}

function TrackJob(props: TrackProps) {
  const { data: job, error } = useJob(props.id);
  const found = job && {
    title: job.title,
    subtitle:
      [job.department, job.location].filter(Boolean).join(" · ") || humanize(job.employment_type),
  };
  useTrack("job", props, found, error);
  return null;
}

function TrackCandidate(props: TrackProps) {
  const { data: candidate, error } = useCandidate(props.id);
  const found = candidate && {
    title: candidate.full_name,
    subtitle: candidate.headline || candidate.email,
  };
  useTrack("candidate", props, found, error);
  return null;
}
