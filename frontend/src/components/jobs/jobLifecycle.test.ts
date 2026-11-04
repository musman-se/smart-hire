import { describe, expect, it } from "vitest";

import { JOB_STATUSES } from "../../api/types";
import { actionLabel, canEditJob, canPublishJob, lifecycleActions } from "./jobLifecycle";

describe("lifecycleActions", () => {
  it("offers exactly one way forward from every status", () => {
    for (const status of JOB_STATUSES) {
      expect(lifecycleActions(status)).toHaveLength(1);
    }
  });

  it("publishes drafts and failed publishes, closes live jobs, reopens closed ones", () => {
    expect(lifecycleActions("draft")).toEqual(["publish"]);
    expect(lifecycleActions("publish_failed")).toEqual(["publish"]);
    expect(lifecycleActions("processing")).toEqual(["close"]);
    expect(lifecycleActions("published")).toEqual(["close"]);
    expect(lifecycleActions("closed")).toEqual(["reopen"]);
  });
});

describe("canEditJob and canPublishJob", () => {
  it("mirror the server's refusals", () => {
    expect(canEditJob("closed")).toBe(false);
    expect(canEditJob("processing")).toBe(false);
    expect(canEditJob("published")).toBe(true);
    expect(canPublishJob("draft")).toBe(true);
    expect(canPublishJob("published")).toBe(false);
  });
});

describe("actionLabel", () => {
  it("calls a second publish attempt a retry", () => {
    expect(actionLabel("publish", "draft")).toBe("Publish");
    expect(actionLabel("publish", "publish_failed")).toBe("Retry publish");
    expect(actionLabel("close", "published")).toBe("Close job");
  });
});
