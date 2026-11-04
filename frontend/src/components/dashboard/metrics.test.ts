import { describe, expect, it } from "vitest";

import type { Application, ApplicationStage, Job } from "../../api/types";
import {
  ATTENTION_RULES,
  activeCount,
  attentionItems,
  averageScore,
  awaitingScore,
  buildFunnel,
  busiestJob,
  dailyTrend,
  dayKey,
  describeBreakdown,
  formatDuration,
  jobVolumes,
  weekOverWeek,
  type AttentionInput,
  type StageCounts,
} from "./metrics";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
// Local time, so day buckets do not depend on the machine's time zone.
const NOW = new Date(2026, 10, 3, 15, 0).getTime();

function at(msAgo: number): string {
  return new Date(NOW - msAgo).toISOString();
}

let sequence = 0;
function application(overrides: Partial<Application> = {}): Application {
  sequence += 1;
  return {
    id: `app-${sequence}`,
    job_id: "job-a",
    candidate_id: `cand-${sequence}`,
    stage: "applied",
    cover_letter: "",
    match_score: 70,
    created_at: at(0),
    updated_at: at(0),
    ...overrides,
  } as Application;
}

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-a",
    title: "Backend Engineer",
    description: "",
    employment_type: "full_time",
    required_skills: [],
    min_experience_years: 0,
    status: "published",
    published_at: null,
    created_at: at(DAY),
    updated_at: at(0),
    ...overrides,
  } as Job;
}

function counts(values: Partial<Record<ApplicationStage, number>>): StageCounts {
  return {
    applied: 0,
    screening: 0,
    interview: 0,
    offer: 0,
    hired: 0,
    rejected: 0,
    withdrawn: 0,
    ...values,
  };
}

describe("buildFunnel", () => {
  it("counts each stage as reached by everyone at it or beyond", () => {
    const funnel = buildFunnel(counts({ applied: 10, screening: 6, interview: 3, offer: 1, hired: 2, rejected: 5, withdrawn: 3 }));

    expect(funnel.entered).toBe(30);
    expect(funnel.steps.map((step) => step.reached)).toEqual([30, 12, 6, 3, 2]);
    expect(funnel.steps.map((step) => step.current)).toEqual([10, 6, 3, 1, 2]);
    expect(funnel.rejected).toBe(5);
    expect(funnel.withdrawn).toBe(3);
  });

  it("gives step-to-step conversion, with none for the first step", () => {
    const funnel = buildFunnel(counts({ applied: 2, screening: 2, interview: 0, offer: 0, hired: 0 }));

    expect(funnel.steps[0]?.conversion).toBeNull();
    expect(funnel.steps[1]?.conversion).toBe(0.5);
    expect(funnel.steps[2]?.conversion).toBe(0);
    // An empty step has no rate to pass on, rather than a division by zero.
    expect(funnel.steps[3]?.conversion).toBeNull();
  });

  it("reports the hire rate over everything received", () => {
    expect(buildFunnel(counts({ applied: 3, hired: 1 })).hireRate).toBe(0.25);
    expect(buildFunnel(counts({})).hireRate).toBeNull();
  });

  it("treats counts that have not loaded as zero", () => {
    const partial = { ...counts({ applied: 4 }), screening: undefined };
    expect(buildFunnel(partial).entered).toBe(4);
  });
});

describe("activeCount", () => {
  it("sums only the non-terminal stages", () => {
    expect(activeCount(counts({ applied: 1, screening: 2, interview: 3, offer: 4, hired: 9, rejected: 9, withdrawn: 9 }))).toBe(10);
  });
});

describe("dailyTrend", () => {
  it("buckets applications by local day, oldest first, ending today", () => {
    const trend = dailyTrend(
      [
        application({ created_at: at(MINUTE) }),
        application({ created_at: at(2 * MINUTE) }),
        application({ created_at: at(DAY) }),
        application({ created_at: at(20 * DAY) }),
      ],
      { now: NOW, days: 14 },
    );

    expect(trend.days).toHaveLength(14);
    expect(trend.days.at(-1)?.key).toBe("2026-11-03");
    expect(trend.days.at(-1)?.count).toBe(2);
    expect(trend.days.at(-2)?.count).toBe(1);
    expect(trend.days[0]?.key).toBe("2026-10-21");
    expect(trend.total).toBe(3);
    expect(trend.max).toBe(2);
  });

  it("marks the days a truncated page may not fully cover", () => {
    const trend = dailyTrend([application({ created_at: at(2 * DAY) })], { now: NOW, truncated: true });

    const complete = trend.days.map((day) => day.complete);
    // The oldest loaded day and everything before it may be missing applications.
    expect(complete.slice(-3)).toEqual([false, true, true]);
    expect(complete.slice(0, -3).every((value) => !value)).toBe(true);
  });

  it("treats every day as complete when nothing was cut off", () => {
    const trend = dailyTrend([application({ created_at: at(2 * DAY) })], { now: NOW });
    expect(trend.days.every((day) => day.complete)).toBe(true);
  });

  it("compares the last two weeks only when both are complete", () => {
    const full = dailyTrend(
      [application({ created_at: at(DAY) }), application({ created_at: at(9 * DAY) })],
      { now: NOW },
    );
    expect(full.thisWeek).toBe(1);
    expect(full.lastWeek).toBe(1);

    const cut = dailyTrend([application({ created_at: at(DAY) })], { now: NOW, truncated: true });
    expect(cut.thisWeek).toBeNull();
    expect(cut.lastWeek).toBeNull();
  });

  it("keeps a floor of 1 for the scale of an empty chart", () => {
    expect(dailyTrend([], { now: NOW }).max).toBe(1);
  });
});

describe("weekOverWeek", () => {
  it("compares the two weeks when both are known", () => {
    expect(weekOverWeek({ thisWeek: 5, lastWeek: 3 })).toEqual({ difference: 2, trend: "up" });
    expect(weekOverWeek({ thisWeek: 1, lastWeek: 4 })).toEqual({ difference: -3, trend: "down" });
    expect(weekOverWeek({ thisWeek: 2, lastWeek: 2 })).toEqual({ difference: 0, trend: "flat" });
  });

  it("says nothing when a week may be incomplete", () => {
    expect(weekOverWeek({ thisWeek: 5, lastWeek: null })).toBeNull();
  });
});

describe("dayKey", () => {
  it("pads month and day", () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("averageScore", () => {
  it("averages scored applications and ignores unscored ones", () => {
    expect(
      averageScore([
        application({ match_score: 80 }),
        application({ match_score: 60 }),
        application({ match_score: null }),
      ]),
    ).toEqual({ average: 70, scored: 2 });
  });

  it("has no average without scores", () => {
    expect(averageScore([application({ match_score: null })])).toEqual({ average: null, scored: 0 });
  });
});

describe("jobVolumes and busiestJob", () => {
  const applications = [
    application({ job_id: "a", stage: "applied" }),
    application({ job_id: "a", stage: "hired" }),
    application({ job_id: "a", stage: "rejected" }),
    application({ job_id: "b", stage: "screening" }),
    application({ job_id: "b", stage: "interview" }),
  ];

  it("groups by job, busiest first, with a per-stage breakdown", () => {
    const volumes = jobVolumes(applications);

    expect(volumes.map((volume) => volume.jobId)).toEqual(["a", "b"]);
    expect(volumes[0]).toMatchObject({ total: 3, active: 1 });
    expect(volumes[0]?.byStage).toMatchObject({ applied: 1, hired: 1, rejected: 1, screening: 0 });
    expect(volumes[1]).toMatchObject({ total: 2, active: 2 });
  });

  it("picks the job with the most active applications", () => {
    expect(busiestJob(jobVolumes(applications))?.jobId).toBe("b");
  });

  it("has no busiest job when nothing is active", () => {
    expect(busiestJob(jobVolumes([application({ stage: "hired" })]))).toBeNull();
  });

  it("describes a breakdown in pipeline order, skipping empty stages", () => {
    expect(describeBreakdown(jobVolumes(applications)[0]!.byStage)).toBe("1 applied, 1 hired, 1 rejected");
    const none = { applied: 0, screening: 0, interview: 0, offer: 0, hired: 0, rejected: 0, withdrawn: 0 };
    expect(describeBreakdown(none)).toBe("No applications");
  });
});

describe("attentionItems", () => {
  const empty: AttentionInput = {
    failedJobs: [],
    processingJobs: [],
    intake: [],
    recentApplications: [],
    appliedApplications: [],
    now: NOW,
  };

  it("is empty when nothing needs a hand", () => {
    expect(attentionItems(empty)).toEqual([]);
  });

  it("flags a publish failure", () => {
    const items = attentionItems({ ...empty, failedJobs: [job({ status: "publish_failed" })] });
    expect(items).toMatchObject([{ kind: "publish_failed", tone: "danger" }]);
  });

  it("flags processing only once it has stalled", () => {
    const items = attentionItems({
      ...empty,
      processingJobs: [
        job({ id: "fresh", status: "processing", updated_at: at(MINUTE) }),
        job({ id: "stuck", status: "processing", updated_at: at(ATTENTION_RULES.stuckProcessingMs + MINUTE) }),
      ],
    });
    expect(items.map((item) => item.key)).toEqual(["stuck-stuck"]);
  });

  it("flags active applications left unscored past the wait, oldest first", () => {
    const items = attentionItems({
      ...empty,
      recentApplications: [
        application({ id: "new", match_score: null, created_at: at(10_000) }),
        application({ id: "old", match_score: null, created_at: at(10 * MINUTE) }),
        application({ id: "older", match_score: null, created_at: at(20 * MINUTE) }),
        application({ id: "scored", match_score: 40, created_at: at(20 * MINUTE) }),
        application({ id: "gone", match_score: null, stage: "withdrawn", created_at: at(20 * MINUTE) }),
      ],
    });
    expect(items.map((item) => item.key)).toEqual(["unscored-older", "unscored-old"]);
  });

  it("flags jobs near their cap as a warning and full ones as danger", () => {
    const items = attentionItems({
      ...empty,
      intake: [
        { job: job({ id: "roomy", max_applications: 10 }), received: 7 },
        { job: job({ id: "near", max_applications: 10 }), received: 8 },
        { job: job({ id: "full", max_applications: 10 }), received: 10 },
      ],
    });
    expect(items).toMatchObject([
      { key: "capacity-full", tone: "danger", received: 10, cap: 10 },
      { key: "capacity-near", tone: "warning" },
    ]);
  });

  it("groups stale applied applications per job", () => {
    const stale = ATTENTION_RULES.staleAppliedMs;
    const items = attentionItems({
      ...empty,
      appliedApplications: [
        application({ job_id: "a", created_at: at(stale + DAY) }),
        application({ job_id: "a", created_at: at(stale + 3 * DAY) }),
        application({ job_id: "a", created_at: at(DAY) }),
        application({ job_id: "b", created_at: at(stale + 5 * DAY) }),
      ],
    });
    expect(items).toMatchObject([
      { kind: "stale_applied", jobId: "b", count: 1 },
      { kind: "stale_applied", jobId: "a", count: 2, oldestAgeMs: stale + 3 * DAY },
    ]);
  });

  it("orders danger before warning before info", () => {
    const items = attentionItems({
      ...empty,
      appliedApplications: [application({ created_at: at(ATTENTION_RULES.staleAppliedMs + DAY) })],
      recentApplications: [application({ match_score: null, created_at: at(5 * MINUTE) })],
      failedJobs: [job({ id: "f", status: "publish_failed" })],
    });
    expect(items.map((item) => item.tone)).toEqual(["danger", "warning", "info"]);
  });
});

describe("awaitingScore", () => {
  it("is true only while a fresh active application is unscored", () => {
    expect(awaitingScore([application({ match_score: null, created_at: at(10_000) })], NOW)).toBe(true);
    expect(awaitingScore([application({ match_score: null, created_at: at(5 * MINUTE) })], NOW)).toBe(false);
    expect(awaitingScore([application({ match_score: 50, created_at: at(10_000) })], NOW)).toBe(false);
    expect(
      awaitingScore([application({ match_score: null, stage: "withdrawn", created_at: at(10_000) })], NOW),
    ).toBe(false);
  });
});

describe("formatDuration", () => {
  it("reads in the largest sensible unit", () => {
    expect(formatDuration(10_000)).toBe("1m");
    expect(formatDuration(12 * MINUTE)).toBe("12m");
    expect(formatDuration(3 * 60 * MINUTE)).toBe("3h");
    expect(formatDuration(4 * DAY)).toBe("4d");
  });
});
