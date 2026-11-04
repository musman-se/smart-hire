import { describe, expect, it } from "vitest";

import type { StageChange } from "../../api/types";
import { progressCaption, stoppedAt } from "./StageStepper";

describe("stoppedAt", () => {
  const history: StageChange[] = [
    { from_stage: null, to_stage: "applied", note: null, changed_at: "2026-11-01T09:00:00Z" },
    { from_stage: "applied", to_stage: "interview", note: null, changed_at: "2026-11-02T09:00:00Z" },
    { from_stage: "interview", to_stage: "rejected", note: null, changed_at: "2026-11-03T09:00:00Z" },
  ];

  it("is the stage left when the application ended", () => {
    expect(stoppedAt(history)).toBe("interview");
  });

  it("is null while the application is still moving", () => {
    expect(stoppedAt(history.slice(0, 2))).toBeNull();
    expect(stoppedAt(undefined)).toBeNull();
  });
});

describe("progressCaption", () => {
  it("names the current step and where it sits", () => {
    expect(progressCaption("screening")).toBe("Step 2 of 5 · Screening");
  });

  it("names the outcome, and where it happened when that is known", () => {
    expect(progressCaption("rejected", "interview")).toBe("Rejected at Interview");
    expect(progressCaption("withdrawn")).toBe("Withdrawn");
    expect(progressCaption("hired")).toBe("Hired");
  });
});
