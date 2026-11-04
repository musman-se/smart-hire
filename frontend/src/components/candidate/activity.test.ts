import { describe, expect, it } from "vitest";

import { buildActivity } from "./activity";
import { makeApplication, makeChange, makeNotification } from "./fixtures";

describe("buildActivity", () => {
  const first = makeApplication({ id: "a1", job_id: "j1" });
  const second = makeApplication({ id: "a2", job_id: "j2" });

  it("merges every application's moves and messages, newest first", () => {
    const events = buildActivity([
      {
        application: first,
        history: [
          makeChange({ changed_at: "2026-10-01T09:00:00Z" }),
          makeChange({ from_stage: "applied", to_stage: "interview", changed_at: "2026-10-05T09:00:00Z" }),
        ],
      },
      {
        application: second,
        history: [makeChange({ changed_at: "2026-10-03T09:00:00Z" })],
        notifications: [
          makeNotification({ kind: "stage_changed", subject: "Update", sent_at: "2026-10-04T09:00:00Z" }),
        ],
      },
    ]);

    expect(events.map((e) => [e.kind, e.jobId, e.at.slice(0, 10)])).toEqual([
      ["stage", "j1", "2026-10-05"],
      ["message", "j2", "2026-10-04"],
      ["stage", "j2", "2026-10-03"],
      ["stage", "j1", "2026-10-01"],
    ]);
  });

  it("folds the automatic confirmation into the application's first event", () => {
    const events = buildActivity([
      { application: first, history: [makeChange()], notifications: [makeNotification()] },
    ]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "stage", first: true, confirmed: true });
  });

  it("marks only the opening event as first", () => {
    const events = buildActivity([
      {
        application: first,
        history: [
          makeChange({ changed_at: "2026-10-01T09:00:00Z" }),
          makeChange({ from_stage: "applied", to_stage: "screening", changed_at: "2026-10-02T09:00:00Z" }),
        ],
        notifications: [makeNotification()],
      },
    ]);
    expect(events.map((e) => e.kind === "stage" && [e.first, e.confirmed])).toEqual([
      [false, false],
      [true, true],
    ]);
  });

  it("caps the feed", () => {
    const history = Array.from({ length: 12 }, (_, day) =>
      makeChange({ changed_at: `2026-10-${String(day + 1).padStart(2, "0")}T09:00:00Z` }),
    );
    expect(buildActivity([{ application: first, history }], 5)).toHaveLength(5);
  });
});
