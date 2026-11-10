import { describe, expect, it } from "vitest";

import { ApiError } from "../../api/client";
import type { StaffMember } from "../../api/types";
import {
  describeStatus,
  invitationLink,
  serverFieldError,
  toInvitePayload,
  validateInvite,
} from "./team";

const NOW = Date.parse("2026-11-10T12:00:00Z");
const HOUR = 3_600_000;

const member = (overrides: Partial<StaffMember>): StaffMember => ({
  id: "r1",
  email: "sara@example.com",
  full_name: "Sara Khan",
  title: null,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
  role: "recruiter",
  status: "active",
  deactivated_at: null,
  invitation_expires_at: null,
  ...overrides,
});

describe("invitationLink", () => {
  it("puts the token in the fragment, which browsers never send to a server", () => {
    expect(invitationLink("abc_123", "https://hire.example.com")).toBe("https://hire.example.com/invite#abc_123");
  });
});

describe("describeStatus", () => {
  it("reads active and deactivated plainly", () => {
    expect(describeStatus(member({}), NOW)).toEqual({ label: "Active", tone: "success" });
    const gone = describeStatus(member({ status: "deactivated", deactivated_at: "2026-11-02T00:00:00Z" }), NOW);
    expect(gone.label).toBe("Deactivated");
    expect(gone.detail).toMatch(/^Since /);
  });

  it("says when an invited person's link expires", () => {
    const expires = new Date(NOW + 5 * HOUR).toISOString();
    const status = describeStatus(member({ status: "invited", invitation_expires_at: expires }), NOW);
    expect(status).toMatchObject({ label: "Invited", detail: "Link expires in 5h" });
    expect(status.needsLink).toBeUndefined();
  });

  it("flags an invited person with no link that works", () => {
    const expired = new Date(NOW - 2 * HOUR).toISOString();
    expect(describeStatus(member({ status: "invited", invitation_expires_at: expired }), NOW)).toMatchObject({
      detail: "Link expired 2h ago",
      needsLink: true,
    });
    // Reactivated before ever choosing a password: invited, but no link was issued.
    expect(describeStatus(member({ status: "invited" }), NOW)).toMatchObject({
      detail: "No working link",
      needsLink: true,
    });
  });
});

describe("validateInvite", () => {
  it("needs a name and an email, and keeps the title optional", () => {
    expect(validateInvite({ full_name: "Sara Khan", email: "sara@example.com", title: "" })).toEqual({});
    expect(Object.keys(validateInvite({ full_name: "", email: "", title: "" }))).toEqual(["full_name", "email"]);
  });

  it("applies the API's lengths", () => {
    expect(validateInvite({ full_name: "S", email: "sara@example.com", title: "" }).full_name).toMatch(/at least 2/);
    expect(validateInvite({ full_name: "Sara", email: "sara@example.com", title: "x".repeat(101) }).title).toMatch(
      /100/,
    );
  });

  it("sends a blank title as no title", () => {
    expect(toInvitePayload({ full_name: " Sara Khan ", email: " sara@example.com", title: "  " })).toEqual({
      full_name: "Sara Khan",
      email: "sara@example.com",
      title: null,
    });
  });
});

describe("serverFieldError", () => {
  it("puts a 422 on the form field it names", () => {
    const error = new ApiError(422, "validation_error", "email: value is not a valid email address");
    expect(serverFieldError(error)).toEqual({ field: "email", message: "Value is not a valid email address" });
  });

  it("leaves other errors to the notice", () => {
    expect(serverFieldError(new ApiError(422, "validation_error", "request: bad body"))).toBeNull();
    expect(serverFieldError(new ApiError(409, "duplicate_email", "email: taken"))).toBeNull();
  });
});
