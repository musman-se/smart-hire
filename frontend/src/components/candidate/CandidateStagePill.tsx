import type { ApplicationStage } from "../../api/types";
import { StagePill } from "../ui";
import { STAGE_COPY } from "./stageCopy";

/** A stage as the candidate reads it — "Under review", not "Screening" — in the colour
 * the hiring team sees it in. */
export function CandidateStagePill({ stage, className }: { stage: ApplicationStage; className?: string }) {
  return <StagePill stage={stage} label={STAGE_COPY[stage].headline} className={className} />;
}
