import { describe, expect, it } from "vitest";

import { NEW_RUN_GRACE_MS, formatElapsed, publishProgress } from "./publishing";

const states = (progress: ReturnType<typeof publishProgress>) => progress.steps.map((s) => s.state);

describe("publishProgress", () => {
  it("follows a running workflow step by step", () => {
    const progress = publishProgress("processing", { status: "running", current_step: "storing" });
    expect(progress.outcome).toBe("running");
    expect(states(progress)).toEqual(["done", "current", "upcoming"]);
  });

  it("treats a run that is only starting as on its first step", () => {
    const progress = publishProgress("processing", { status: "running", current_step: "starting" });
    expect(states(progress)).toEqual(["current", "upcoming", "upcoming"]);
  });

  it("calls a processing job with no live run stuck", () => {
    expect(publishProgress("processing", null).outcome).toBe("stuck");
    expect(publishProgress("processing", { status: "failed", current_step: "failed" }).outcome).toBe("stuck");
  });

  describe("publishing again, before the new run is reported", () => {
    const previousRun = {
      status: "completed",
      current_step: "completed",
      started_at: "2026-11-04T10:00:00Z",
    };
    const republishedAt = "2026-11-04T10:05:00Z";

    it("reads the previous run as the new one starting", () => {
      const progress = publishProgress("processing", previousRun, {
        jobUpdatedAt: republishedAt,
        now: Date.parse(republishedAt) + 1_000,
      });
      expect(progress.outcome).toBe("running");
      expect(states(progress)).toEqual(["current", "upcoming", "upcoming"]);
    });

    it("calls it stuck once the grace period has passed", () => {
      const progress = publishProgress("processing", previousRun, {
        jobUpdatedAt: republishedAt,
        now: Date.parse(republishedAt) + NEW_RUN_GRACE_MS + 1,
      });
      expect(progress.outcome).toBe("stuck");
    });

    it("still calls a run that died after the publish stuck", () => {
      const diedAfter = { ...previousRun, status: "failed", started_at: "2026-11-04T10:05:01Z" };
      const progress = publishProgress("processing", diedAfter, {
        jobUpdatedAt: republishedAt,
        now: Date.parse(republishedAt) + 2_000,
      });
      expect(progress.outcome).toBe("stuck");
    });
  });

  it("marks the failed step when it is known", () => {
    const progress = publishProgress("publish_failed", { status: "failed", current_step: "storing" });
    expect(progress.outcome).toBe("failed");
    expect(states(progress)).toEqual(["done", "failed", "upcoming"]);
  });

  it("does not guess which step failed when the run does not say", () => {
    const progress = publishProgress("publish_failed", { status: "failed", current_step: "failed" });
    expect(states(progress)).toEqual(["upcoming", "upcoming", "upcoming"]);
  });

  it("shows a completed run as done, whatever the job did after", () => {
    expect(publishProgress("published", { status: "completed", current_step: "completed" }).outcome).toBe(
      "completed",
    );
    expect(states(publishProgress("closed", { status: "completed", current_step: null }))).toEqual([
      "done",
      "done",
      "done",
    ]);
  });

  it("is idle for a draft that was never published", () => {
    expect(publishProgress("draft", null)).toMatchObject({ outcome: "idle" });
  });
});

describe("formatElapsed", () => {
  const start = "2026-11-03T10:00:00Z";
  const at = (seconds: number) => Date.parse(start) + seconds * 1000;

  it("scales its unit with the duration", () => {
    expect(formatElapsed(start, at(8))).toBe("8s");
    expect(formatElapsed(start, at(125))).toBe("2m 05s");
    expect(formatElapsed(start, at(3780))).toBe("1h 03m");
  });

  it("is null without a start", () => {
    expect(formatElapsed(null, at(0))).toBeNull();
  });
});
