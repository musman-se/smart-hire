import { describe, expect, it } from "vitest";

import type { Application } from "../../api/types";
import {
  SCORE_WAIT_MS,
  buildActivity,
  forwardStage,
  isAwaitingScore,
  isScoreStalled,
  matchesSearch,
  recruiterTargets,
  summarizeApplications,
} from "./stages";

function application(overrides: Partial<Application> = {}): Application {
  return {
    id: "a1",
    job_id: "j1",
    candidate_id: "c1",
    stage: "applied",
    cover_letter: null,
    match_score: null,
    created_at: "2026-11-03T10:00:00Z",
    updated_at: "2026-11-03T10:00:00Z",
    ...overrides,
  };
}

describe("recruiterTargets", () => {
  it("never offers withdrawing, which only the candidate may do", () => {
    expect(recruiterTargets("applied")).toEqual(["screening", "rejected"]);
    expect(recruiterTargets("offer")).toEqual(["hired", "rejected"]);
  });

  it("offers nothing from a terminal stage", () => {
    expect(recruiterTargets("hired")).toEqual([]);
    expect(recruiterTargets("withdrawn")).toEqual([]);
  });
});

describe("forwardStage", () => {
  it("is the next step on the pipeline", () => {
    expect(forwardStage("applied")).toBe("screening");
    expect(forwardStage("interview")).toBe("offer");
    expect(forwardStage("offer")).toBe("hired");
  });

  it("is null at the end", () => {
    expect(forwardStage("hired")).toBeNull();
    expect(forwardStage("rejected")).toBeNull();
  });
});

describe("isScoreStalled", () => {
  const created = Date.parse("2026-11-03T10:00:00Z");

  it("is false while the score may still arrive", () => {
    expect(isScoreStalled(application(), created + 5_000)).toBe(false);
  });

  it("is true for an active application unscored past the wait", () => {
    expect(isScoreStalled(application(), created + SCORE_WAIT_MS + 1)).toBe(true);
  });

  it("is false once scored, even a zero", () => {
    expect(isScoreStalled(application({ match_score: 0 }), created + SCORE_WAIT_MS * 10)).toBe(
      false,
    );
  });

  it("ignores finished applications", () => {
    expect(
      isScoreStalled(application({ stage: "rejected" }), created + SCORE_WAIT_MS * 10),
    ).toBe(false);
  });
});

describe("isAwaitingScore", () => {
  const created = Date.parse("2026-11-03T10:00:00Z");

  it("is exactly the other side of the stall cut-off", () => {
    for (const at of [created + 5_000, created + SCORE_WAIT_MS, created + SCORE_WAIT_MS + 1]) {
      expect(isAwaitingScore(application(), at)).toBe(!isScoreStalled(application(), at));
    }
    expect(isAwaitingScore(application(), created + SCORE_WAIT_MS + 1)).toBe(false);
  });

  it("is false once scored or finished", () => {
    expect(isAwaitingScore(application({ match_score: 40 }), created + 5_000)).toBe(false);
    expect(isAwaitingScore(application({ stage: "withdrawn" }), created + 5_000)).toBe(false);
  });
});

describe("summarizeApplications", () => {
  it("counts active ones, the best score and the furthest stage", () => {
    const summary = summarizeApplications([
      application({ stage: "interview", match_score: 62 }),
      application({ stage: "rejected", match_score: 88 }),
      application({ stage: "applied", match_score: null }),
    ]);
    expect(summary).toEqual({ total: 3, active: 2, bestScore: 88, furthest: "interview" });
  });

  it("is empty for no applications", () => {
    expect(summarizeApplications([])).toEqual({
      total: 0,
      active: 0,
      bestScore: null,
      furthest: null,
    });
  });
});

describe("buildActivity", () => {
  it("merges stage changes and messages, newest first", () => {
    const events = buildActivity(
      [
        { from_stage: null, to_stage: "applied", note: null, changed_at: "2026-11-01T09:00:00Z" },
        {
          from_stage: "applied",
          to_stage: "screening",
          note: "Strong SQL",
          changed_at: "2026-11-02T09:00:00Z",
        },
      ],
      [
        {
          kind: "application_received",
          channel: "email",
          recipient: "a@example.com",
          subject: "We got your application",
          body: "Thanks",
          sent_at: "2026-11-01T09:00:05Z",
        },
      ],
    );
    expect(events.map((event) => event.kind)).toEqual(["stage", "message", "stage"]);
    expect(events[0]).toMatchObject({ to: "screening", note: "Strong SQL" });
  });
});

describe("matchesSearch", () => {
  it("needs every word somewhere in the fields, ignoring case", () => {
    const fields = ["Ayesha Khan", "Backend Engineer"];
    expect(matchesSearch(fields, "khan backend")).toBe(true);
    expect(matchesSearch(fields, "khan frontend")).toBe(false);
  });

  it("matches everything for an empty query and skips missing fields", () => {
    expect(matchesSearch([null, undefined], "  ")).toBe(true);
    expect(matchesSearch([null, "Data"], "data")).toBe(true);
  });
});
