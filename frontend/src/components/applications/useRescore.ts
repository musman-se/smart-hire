import { useProcessApplication } from "../../hooks/queries";
import { useToast } from "../ui";

/**
 * "Re-run scoring", with the feedback it needs: the work happens in a worker after
 * the request returns, so success means "started", not "done".
 */
export function useRescore() {
  const process = useProcessApplication();
  const toast = useToast();

  function rescore(applicationId: string) {
    process.mutate(applicationId, {
      onSuccess: () =>
        toast.info("Scoring again", { description: "The new score appears here in a moment." }),
      onError: (error) => toast.error(error),
    });
  }

  return { rescore, isPending: process.isPending };
}
