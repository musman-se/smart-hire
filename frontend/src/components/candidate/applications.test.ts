import { describe, expect, it } from "vitest";

import { capState, isActive, sortApplications, splitApplications } from "./applications";
import { makeApplication } from "./fixtures";

describe("isActive / splitApplications", () => {
  it("counts every non-terminal stage as active", () => {
    expect(isActive({ stage: "applied" })).toBe(true);
    expect(isActive({ stage: "offer" })).toBe(true);
    expect(isActive({ stage: "hired" })).toBe(false);
    expect(isActive({ stage: "withdrawn" })).toBe(false);
  });

  it("splits a list without reordering it", () => {
    const list = [
      makeApplication({ id: "a", stage: "applied" }),
      makeApplication({ id: "b", stage: "rejected" }),
      makeApplication({ id: "c", stage: "interview" }),
    ];
    const { active, closed } = splitApplications(list);
    expect(active.map((a) => a.id)).toEqual(["a", "c"]);
    expect(closed.map((a) => a.id)).toEqual(["b"]);
  });
});

describe("sortApplications", () => {
  const older = makeApplication({ id: "old", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-03-01T00:00:00Z" });
  const newer = makeApplication({ id: "new", created_at: "2026-02-01T00:00:00Z", updated_at: "2026-02-02T00:00:00Z" });

  it("orders by last movement or by application date, newest first", () => {
    expect(sortApplications([newer, older], "updated").map((a) => a.id)).toEqual(["old", "new"]);
    expect(sortApplications([older, newer], "applied").map((a) => a.id)).toEqual(["new", "old"]);
  });

  it("does not mutate its input", () => {
    const list = [newer, older];
    sortApplications(list, "updated");
    expect(list.map((a) => a.id)).toEqual(["new", "old"]);
  });
});

describe("capState", () => {
  it("has room, then warns, then is full", () => {
    expect(capState(3, 10)).toEqual({ used: 3, max: 10, remaining: 7, level: "ok" });
    expect(capState(8, 10).level).toBe("near");
    expect(capState(10, 10).level).toBe("full");
  });

  it("never reports negative room when the server's cap is lower than ours", () => {
    expect(capState(12, 10)).toMatchObject({ remaining: 0, level: "full" });
  });
});
