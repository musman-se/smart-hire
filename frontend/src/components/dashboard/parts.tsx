/** Small pieces the dashboard cards share. */

import type { CSSProperties } from "react";

import type { ApplicationStage } from "../../api/types";
import { Button, Notice, describeError } from "../ui";

/** Every stage's colour is a token, so charts follow the theme without knowing it. */
export function stageColor(stage: ApplicationStage): string {
  return `var(--stage-${stage}-fg)`;
}

/** The coloured square a chart legend or a funnel row uses to name a stage. */
export function StageSwatch({ stage }: { stage: ApplicationStage }) {
  return (
    <span
      className="dashboard-swatch"
      style={{ "--swatch": stageColor(stage) } as CSSProperties}
      aria-hidden="true"
    />
  );
}

/** A card that failed to load says why and offers a retry, without taking the page down. */
export function CardError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { title, message } = describeError(error);
  return (
    <Notice
      tone="error"
      title={title}
      action={
        <Button size="sm" leftIcon="refresh" onClick={onRetry}>
          Try again
        </Button>
      }
    >
      {message}
    </Notice>
  );
}
