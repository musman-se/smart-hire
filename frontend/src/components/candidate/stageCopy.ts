import type { ApplicationStage } from "../../api/types";
import type { IconName } from "../ui";

export type StageTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

interface StageCopy {
  /** What the stage means to the person who applied — not the recruiter's term. */
  headline: string;
  /** One sentence on what happens next. */
  next: string;
  icon: IconName;
  tone: StageTone;
}

/**
 * Stage names are the recruiter's vocabulary; a candidate reads "screening" as a test
 * they have to sit. Everything the candidate side says about a stage comes from here.
 */
export const STAGE_COPY: Record<ApplicationStage, StageCopy> = {
  applied: {
    headline: "Application received",
    next: "The hiring team will review it soon.",
    icon: "send",
    tone: "neutral",
  },
  screening: {
    headline: "Under review",
    next: "A recruiter is looking at your profile.",
    icon: "eye",
    tone: "info",
  },
  interview: {
    headline: "Interviewing",
    next: "Expect a message about scheduling.",
    icon: "message-square",
    tone: "accent",
  },
  offer: {
    headline: "Offer extended",
    next: "Check your email for the details.",
    icon: "award",
    tone: "success",
  },
  hired: {
    headline: "Hired",
    next: "Congratulations on the new role.",
    icon: "check-circle",
    tone: "success",
  },
  rejected: {
    headline: "Not moving forward",
    next: "The team has decided not to continue with this application.",
    icon: "x-circle",
    tone: "danger",
  },
  withdrawn: {
    headline: "Withdrawn",
    next: "You withdrew this application. You cannot apply to this job again.",
    icon: "archive",
    tone: "neutral",
  },
};
