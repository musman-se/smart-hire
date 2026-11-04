import { describe, expect, it } from "vitest";

import { jobContext, jobName } from "./jobName";

describe("jobName", () => {
  it("adds the department and location, so same-titled jobs differ", () => {
    const lahore = { title: "Frontend Engineer", department: "Engineering", location: "Lahore" };
    const islamabad = { title: "Frontend Engineer", department: "Product Engineering", location: "Islamabad" };
    expect(jobName(lahore)).toBe("Frontend Engineer · Engineering · Lahore");
    expect(jobName(lahore)).not.toBe(jobName(islamabad));
  });

  it("skips what is not set", () => {
    expect(jobName({ title: "Designer", department: null, location: "Remote" })).toBe("Designer · Remote");
    expect(jobName({ title: "Designer", department: null, location: null })).toBe("Designer");
    expect(jobContext({ department: "", location: null })).toBe("");
  });
});
