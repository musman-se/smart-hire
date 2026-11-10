import { describe, expect, it } from "vitest";

import type { RecruiterProfile } from "../../api/types";
import { RECRUITER_LIMITS, recruiterProfileChanges, validateRecruiterProfile } from "./recruiterProfile";

const saved = {
  id: "r1",
  email: "sara@example.com",
  full_name: "Sara Khan",
  title: "Recruiter",
  created_at: "",
  updated_at: "",
} as RecruiterProfile;

describe("validateRecruiterProfile", () => {
  it("trims the name before counting it, as the server does", () => {
    expect(validateRecruiterProfile({ full_name: "   ", title: "" }).full_name).toBe("Enter your full name");
    expect(validateRecruiterProfile({ full_name: " A ", title: "" }).full_name).toMatch(/at least 2/);
    expect(validateRecruiterProfile({ full_name: "  Sara  ", title: "" })).toEqual({});
  });

  it("caps the name and the title", () => {
    const errors = validateRecruiterProfile({
      full_name: "x".repeat(RECRUITER_LIMITS.fullNameMax + 1),
      title: "y".repeat(RECRUITER_LIMITS.titleMax + 1),
    });
    expect(errors.full_name).toMatch(/160/);
    expect(errors.title).toMatch(/100/);
  });
});

describe("recruiterProfileChanges", () => {
  it("sends only what changed, trimmed", () => {
    expect(recruiterProfileChanges(saved, { full_name: " Sara Khan ", title: "Recruiter" })).toEqual({});
    expect(recruiterProfileChanges(saved, { full_name: "Sara  Ali ", title: "Recruiter" })).toEqual({
      full_name: "Sara  Ali",
    });
  });

  it("sends a blank title as null: no title", () => {
    expect(recruiterProfileChanges(saved, { full_name: "Sara Khan", title: "   " })).toEqual({ title: null });
  });
});
