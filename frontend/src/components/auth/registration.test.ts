import { describe, expect, it } from "vitest";

import {
  EMPTY_DRAFT,
  LIMITS,
  normalizeSkill,
  toRegistrationPayload,
  validateStep,
  type RegistrationDraft,
} from "./registration";

const VALID: RegistrationDraft = {
  full_name: "Ayesha Khan",
  email: "ayesha@example.com",
  password: "Blue-house-7x",
  headline: "Backend engineer",
  years_experience: "4",
  skills: ["python", "fastapi"],
  phone: "",
};

const draft = (patch: Partial<RegistrationDraft>) => ({ ...VALID, ...patch });

describe("validateStep — account", () => {
  it("asks for every account field on an empty form", () => {
    expect(Object.keys(validateStep("account", EMPTY_DRAFT))).toEqual([
      "full_name",
      "email",
      "password",
    ]);
  });

  it("never reports profile fields, so step one can be finished on its own", () => {
    const errors = validateStep("account", draft({ years_experience: "", headline: "x".repeat(500) }));
    expect(errors).toEqual({});
  });

  it("mirrors the API's name and password lengths", () => {
    expect(validateStep("account", draft({ full_name: " A " })).full_name).toMatch(/at least 2/);
    expect(validateStep("account", draft({ full_name: "x".repeat(LIMITS.fullNameMax + 1) })).full_name)
      .toMatch(/160 characters or fewer/);
    expect(validateStep("account", draft({ password: "short" })).password).toMatch(/at least 8/);
    expect(validateStep("account", draft({ password: "p".repeat(129) })).password).toMatch(/128/);
  });

  it("catches a malformed email", () => {
    expect(validateStep("account", draft({ email: "ayesha@" })).email).toMatch(/like name@example.com/);
  });
});

describe("validateStep — profile", () => {
  it("accepts the defaults: no headline, zero years, no skills", () => {
    expect(validateStep("profile", EMPTY_DRAFT)).toEqual({});
  });

  it("wants a whole number of years from 0 to 60", () => {
    expect(validateStep("profile", draft({ years_experience: "" })).years_experience).toBeDefined();
    expect(validateStep("profile", draft({ years_experience: "2.5" })).years_experience).toMatch(/whole/);
    expect(validateStep("profile", draft({ years_experience: "-1" })).years_experience).toMatch(/0 to 60/);
    expect(validateStep("profile", draft({ years_experience: "61" })).years_experience).toMatch(/0 to 60/);
    expect(validateStep("profile", draft({ years_experience: "60" }))).toEqual({});
  });

  it("limits headline, phone and each skill's length", () => {
    const errors = validateStep(
      "profile",
      draft({
        headline: "h".repeat(LIMITS.headlineMax + 1),
        phone: "1".repeat(LIMITS.phoneMax + 1),
        skills: ["ok", "s".repeat(LIMITS.skillMax + 1)],
      }),
    );
    expect(Object.keys(errors).sort()).toEqual(["headline", "phone", "skills"]);
  });

  it("wants a phone number that can be dialled, or none", () => {
    expect(validateStep("profile", draft({ phone: "abc" })).phone).toMatch(/digits, spaces, \+, -/);
    expect(validateStep("profile", draft({ phone: "+92 300 1234567" })).phone).toBeUndefined();
    expect(validateStep("profile", draft({ phone: "  " })).phone).toBeUndefined();
  });
});

describe("toRegistrationPayload", () => {
  it("trims text, turns optional blanks into null and years into a number", () => {
    expect(
      toRegistrationPayload(
        draft({ full_name: "  Ayesha Khan ", email: " ayesha@example.com ", headline: "  ", phone: " +92 300 " }),
      ),
    ).toEqual({
      full_name: "Ayesha Khan",
      email: "ayesha@example.com",
      password: "Blue-house-7x",
      headline: null,
      phone: "+92 300",
      years_experience: 4,
      skills: ["python", "fastapi"],
    });
  });

  it("never trims the password: spaces in it are the user's choice", () => {
    expect(toRegistrationPayload(draft({ password: " padded pass " })).password).toBe(" padded pass ");
  });
});

describe("normalizeSkill", () => {
  it("stores skills the way the API does", () => {
    expect(normalizeSkill("  FastAPI ")).toBe("fastapi");
  });
});

describe("validateStep — skill list", () => {
  it("caps the number of skills at the server's limit", () => {
    const skills = Array.from({ length: LIMITS.skillsMax + 1 }, (_, i) => `skill-${i}`);
    expect(validateStep("profile", draft({ skills })).skills).toMatch(/at most 50 skills/);
  });
});
