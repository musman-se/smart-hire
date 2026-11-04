import { useWithdrawApplication } from "../../hooks/queries";
import { useConfirm, useToast } from "../ui";

/**
 * Withdrawing is final — the server will not take a second application to the same
 * job — so it always asks first, and says so. Shared by the list's row menu and the
 * detail drawer so both read the same.
 */
export function useWithdraw() {
  const confirm = useConfirm();
  const toast = useToast();
  const mutation = useWithdrawApplication();

  async function withdraw(applicationId: string, jobTitle: string): Promise<boolean> {
    const confirmed = await confirm({
      title: `Withdraw your application to ${jobTitle}?`,
      body:
        "The hiring team will stop reviewing it and it frees one of your active " +
        "application slots. This can't be undone, and you won't be able to apply to " +
        "this role again.",
      confirmLabel: "Withdraw application",
      cancelLabel: "Keep it",
      tone: "danger",
    });
    if (!confirmed) return false;

    try {
      await mutation.mutateAsync(applicationId);
      toast.success("Application withdrawn", {
        description: `${jobTitle} no longer counts toward your active applications.`,
      });
      return true;
    } catch (error) {
      toast.error(error);
      return false;
    }
  }

  return {
    withdraw,
    /** The application being withdrawn right now, to put its button in a busy state. */
    pendingId: mutation.isPending ? mutation.variables : undefined,
  };
}
