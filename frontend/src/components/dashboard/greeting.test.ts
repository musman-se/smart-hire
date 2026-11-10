import { describe, expect, it } from "vitest";

import { greetingFor, greetingName } from "./greeting";

describe("greetingName", () => {
  it("takes the first word of the email's local part", () => {
    expect(greetingName("sara.khan@example.com")).toBe("Sara");
    expect(greetingName("OMAR_farooq@example.com")).toBe("Omar");
  });

  it("does not greet a shared mailbox or a handle by name", () => {
    expect(greetingName("recruiter@smarthire.dev")).toBeNull();
    expect(greetingName("hr@example.com")).toBeNull();
    expect(greetingName("user123@example.com")).toBeNull();
    expect(greetingName("a@example.com")).toBeNull();
  });
});

describe("greetingFor", () => {
  it("prefers the first name on the recruiter's profile", () => {
    expect(greetingFor("hr@example.com", "  Ayesha Siddiqui ")).toBe("Ayesha");
  });

  it("falls back to the email while the profile is loading", () => {
    expect(greetingFor("sara.khan@example.com", undefined)).toBe("Sara");
    expect(greetingFor("hr@example.com", null)).toBeNull();
  });
});
