import type { Job } from "../../api/types";
import { useDeleteJob, useJobTransition } from "../../hooks/queries";
import { DropdownMenu, IconButton, useConfirm, useToast, type MenuEntry } from "../ui";
import {
  ACTION_ICONS,
  actionLabel,
  canEditJob,
  EDIT_BLOCKED_HINT,
  lifecycleActions,
  type JobAction,
} from "./jobLifecycle";

/**
 * The row menu on the recruiter's jobs table: navigate, move the job through its
 * lifecycle, or delete it. Results are reported by toast. They are awaited as promises
 * rather than through mutate() callbacks, because a published job can leave the
 * current status tab — unmounting this row — before those callbacks would run.
 */
export function JobActionsMenu({ job }: { job: Job }) {
  const transition = useJobTransition(job.id);
  const deleteJob = useDeleteJob();
  const confirm = useConfirm();
  const toast = useToast();
  const name = `“${job.title}”`;

  async function runTransition(action: JobAction) {
    if (action === "close") {
      const confirmed = await confirm({
        title: `Close ${name}?`,
        body: "Candidates can no longer apply. Applications already in the pipeline stay where they are, and you can reopen the job later as a draft.",
        confirmLabel: "Close job",
      });
      if (!confirmed) return;
    }
    const messages = TRANSITION_TOASTS[action];
    toast
      .promise(transition.mutateAsync(action), {
        loading: messages.loading,
        success: messages.success(name),
      })
      // The toast has already reported the failure.
      .catch(() => undefined);
  }

  async function remove() {
    const confirmed = await confirm({
      title: `Delete ${name}?`,
      body: "The job and every application to it are deleted for good. To stop new applications but keep the history, close the job instead.",
      confirmLabel: "Delete job",
      tone: "danger",
    });
    if (!confirmed) return;
    toast
      .promise(deleteJob.mutateAsync(job.id), {
        loading: `Deleting ${name}…`,
        success: `${name} deleted`,
      })
      .catch(() => undefined);
  }

  const editable = canEditJob(job.status);
  const items: MenuEntry[] = [
    { label: "View job", icon: "eye", to: `/jobs/${job.id}` },
    {
      label: "Edit",
      icon: "edit",
      to: editable ? `/jobs/${job.id}/edit` : undefined,
      disabled: !editable,
      hint: EDIT_BLOCKED_HINT[job.status],
    },
    { label: "Open pipeline", icon: "kanban", to: `/jobs/${job.id}/pipeline` },
    { type: "separator" },
    ...lifecycleActions(job.status).map(
      (action): MenuEntry => ({
        label: actionLabel(action, job.status),
        icon: ACTION_ICONS[action],
        disabled: transition.isPending,
        onSelect: () => void runTransition(action),
      }),
    ),
    { type: "separator" },
    {
      label: "Delete",
      icon: "trash",
      danger: true,
      disabled: deleteJob.isPending,
      onSelect: () => void remove(),
    },
  ];

  return (
    <DropdownMenu
      align="end"
      items={items}
      trigger={(props) => (
        <IconButton {...props} icon="more-horizontal" size="sm" aria-label={`Actions for ${job.title}`} />
      )}
    />
  );
}

const TRANSITION_TOASTS: Record<JobAction, { loading: string; success: (name: string) => string }> = {
  publish: {
    loading: "Starting to publish…",
    success: (name) => `Publishing ${name} — it goes live once its content is analysed`,
  },
  close: {
    loading: "Closing the job…",
    success: (name) => `${name} closed to new applications`,
  },
  reopen: {
    loading: "Reopening the job…",
    success: (name) => `${name} is a draft again — publish it when it is ready`,
  },
};
