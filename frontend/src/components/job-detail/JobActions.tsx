import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useRef } from "react";
import { useNavigate } from "react-router-dom";

import type { Job, JobStatus } from "../../api/types";
import { keys, useDeleteJob, useJobTransition } from "../../hooks/queries";
import { ACTION_ICONS, actionLabel, canEditJob, EDIT_BLOCKED_HINT, lifecycleActions } from "../jobs/jobLifecycle";
import { Button, ButtonLink, DropdownMenu, IconButton, pluralize, useConfirm, useToast, type MenuEntry } from "../ui";

export interface JobActionsProps {
  job: Job;
  /** Applications received, for the delete warning; undefined while loading. */
  applicationCount: number | undefined;
  /** Brings the Publishing tab forward, from the toast that follows Publish. */
  onShowPublishing: () => void;
}

/**
 * A job's lifecycle in the header: one primary action that fits its status (publish,
 * open the pipeline, reopen), Edit, and the rarer or destructive ones in a menu, each
 * confirmed where it cannot be taken back. Which actions exist comes from jobLifecycle,
 * as in the jobs table's row menu, so the two cannot drift apart.
 */
export function JobActions({ job, applicationCount, onShowPublishing }: JobActionsProps) {
  const queryClient = useQueryClient();
  const transition = useJobTransition(job.id);
  const deleteJob = useDeleteJob();
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();

  // The "Publishing started" toast, while the workflow it announced is still running.
  const startedToast = useRef<number | null>(null);

  function reportPublish(status: JobStatus) {
    if (status === "published") {
      toast.success("Job published", { description: "It is live and accepting applications." });
    } else if (status === "publish_failed") {
      toast.error("Publishing failed", {
        description: "The Publishing tab shows which step failed. Fix it, then retry.",
        action: { label: "See why", onClick: onShowPublishing },
      });
    } else if (status === "processing") {
      startedToast.current = toast.info("Publishing started", {
        description: "Analysing the description — this usually takes a few seconds.",
        action: { label: "Watch progress", onClick: onShowPublishing },
      });
    }
  }

  // Once the workflow finishes, the "started" toast gives way to the outcome, so it
  // never sits beside a job that is already live (or has failed).
  const settlePublish = useEffectEvent((status: JobStatus) => {
    const id = startedToast.current;
    if (id === null || status === "processing") return;
    startedToast.current = null;
    toast.dismiss(id);
    reportPublish(status);
  });
  useEffect(() => {
    settlePublish(job.status);
  }, [job.status]);

  function publish() {
    transition.mutate("publish", {
      onSuccess: (started) => {
        // The mutation settles only once the job has been read again, and a short
        // workflow has often finished by then: report where it stands now, not the
        // "processing" the request answered with.
        reportPublish(queryClient.getQueryData<Job>(keys.job(job.id))?.status ?? started.status);
      },
      onError: (error) => toast.error(error),
    });
  }

  async function close() {
    const ok = await confirm({
      title: "Close this job?",
      body: "Candidates can no longer apply. Applications already in the pipeline stay where they are, and you can reopen the job later as a draft.",
      confirmLabel: "Close job",
    });
    if (!ok) return;
    transition.mutate("close", {
      onSuccess: () => toast.success("Job closed", { description: "It no longer accepts applications." }),
      onError: (error) => toast.error(error),
    });
  }

  function reopen() {
    transition.mutate("reopen", {
      onSuccess: () => toast.success("Reopened as a draft", { description: "Publish it again to go live." }),
      onError: (error) => toast.error(error),
    });
  }

  async function remove() {
    const ok = await confirm({
      title: `Delete “${job.title}”?`,
      // Until the count arrives, still warn that applications go too: the cascade is
      // the part a recruiter must not miss.
      body:
        applicationCount !== undefined && applicationCount > 0
          ? `This permanently removes the job and its ${pluralize(applicationCount, "application")}, with their history. It cannot be undone. Closing the job keeps the record instead.`
          : "The job and every application to it are deleted for good. To stop new applications but keep the history, close the job instead.",
      confirmLabel: "Delete job",
      tone: "danger",
    });
    if (!ok) return;
    deleteJob.mutate(job.id, {
      onSuccess: () => {
        toast.success("Job deleted");
        navigate("/jobs", { replace: true });
      },
      onError: (error) => toast.error(error),
    });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/jobs/${job.id}`);
      toast.success("Link copied", { description: "Signed-in candidates can open it once the job is live." });
    } catch {
      toast.error("Could not copy the link", { description: "Your browser blocked clipboard access." });
    }
  }

  const editable = canEditJob(job.status);
  const actions = lifecycleActions(job.status);
  const pipelinePath = `/jobs/${job.id}/pipeline`;

  const menu: MenuEntry[] = [
    { label: "Copy link", icon: "link", onSelect: copyLink },
    ...(job.status !== "published" ? [{ label: "Open pipeline", icon: "kanban", to: pipelinePath } as const] : []),
    ...(editable ? [] : [{ label: "Edit", icon: "edit", disabled: true, hint: EDIT_BLOCKED_HINT[job.status] } as const]),
    { type: "separator" },
    ...(actions.includes("close")
      ? [
          {
            label: actionLabel("close", job.status),
            icon: ACTION_ICONS.close,
            disabled: transition.isPending,
            onSelect: () => void close(),
          },
        ]
      : []),
    { label: "Delete job", icon: "trash", danger: true, onSelect: () => void remove() },
  ];

  return (
    <>
      {editable && (
        <ButtonLink to={`/jobs/${job.id}/edit`} leftIcon="edit">
          Edit
        </ButtonLink>
      )}
      {actions.includes("publish") && (
        <Button variant="primary" leftIcon={ACTION_ICONS.publish} loading={transition.isPending} onClick={publish}>
          {actionLabel("publish", job.status)}
        </Button>
      )}
      {job.status === "processing" && (
        <Button variant="primary" loading>
          Publishing…
        </Button>
      )}
      {job.status === "published" && (
        <ButtonLink to={pipelinePath} variant="primary" leftIcon="kanban">
          Open pipeline
        </ButtonLink>
      )}
      {actions.includes("reopen") && (
        <Button variant="primary" leftIcon={ACTION_ICONS.reopen} loading={transition.isPending} onClick={reopen}>
          {actionLabel("reopen", job.status)}
        </Button>
      )}
      <DropdownMenu
        align="end"
        items={menu}
        aria-label="More job actions"
        trigger={(props) => <IconButton {...props} variant="secondary" icon="more-horizontal" aria-label="More job actions" />}
      />
    </>
  );
}
