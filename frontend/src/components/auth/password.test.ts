import { describe, expect, it } from "vitest";

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordChecks,
  passwordStrength,
  validateNewPassword,
  validatePasswordChange,
} from "./password";

const check = (password: string, id: string, context = {}) =>
  passwordChecks(password, context).find((item) => item.id === id);

describe("passwordStrength", () => {
  it("scores anything under the minimum as too short", () => {
    expect(passwordStrength("")).toEqual({ score: 0, label: "Too short" });
    expect(passwordStrength("a".repeat(PASSWORD_MIN_LENGTH - 1)).score).toBe(0);
  });

  it("flags a password over the API's ceiling", () => {
    expect(passwordStrength("x".repeat(PASSWORD_MAX_LENGTH + 1))).toEqual({
      score: 0,
      label: "Too long",
    });
  });

  it("caps common, repeated and sequential passwords at Weak, however long", () => {
    for (const guessable of ["password", "Password1!", "aaaaaaaaaaaaaaaa", "12345678", "87654321", "abcdefghijkl"]) {
      expect(passwordStrength(guessable), guessable).toEqual({ score: 1, label: "Weak" });
    }
  });

  it("caps a password built from the user's own name or email at Weak", () => {
    const context = { email: "ayesha.k@example.com", fullName: "Ayesha Khan" };
    expect(passwordStrength("Khan#2024-Secure", context).score).toBe(1);
    expect(passwordStrength("my-ayesha.k-pass", context).score).toBe(1);
  });

  it("rewards length and variety", () => {
    expect(passwordStrength("bluehouse")).toEqual({ score: 1, label: "Weak" }); // short, one class
    expect(passwordStrength("Tr0ub4dor&3").score).toBe(2); // variety, under 12
    expect(passwordStrength("bluehouseriver").score).toBe(2); // 12+, one class
    expect(passwordStrength("Blue-house-7x").score).toBe(4); // 12+ with all four classes
    expect(passwordStrength("correct horse battery staple").score).toBe(3); // long, two classes
  });

  it("counts length in code points, as the API does", () => {
    // Four emoji are eight UTF-16 units but only four characters: still too short.
    expect(passwordStrength("🔑🔑🔑🔑").score).toBe(0);
  });
});

describe("passwordChecks", () => {
  it("marks only the length rule as required", () => {
    const required = passwordChecks("").filter((item) => item.required);
    expect(required.map((item) => item.id)).toEqual(["length"]);
  });

  it("meets the length rule inside the range only", () => {
    expect(check("a".repeat(7), "length")?.met).toBe(false);
    expect(check("a".repeat(8), "length")?.met).toBe(true);
    expect(check("a".repeat(129), "length")?.met).toBe(false);
  });

  it("needs three character classes for variety", () => {
    expect(check("abcDEF12", "variety")?.met).toBe(true);
    expect(check("abcdef12", "variety")?.met).toBe(false);
  });

  it("does not tick 'avoids your name' before anything is typed", () => {
    expect(check("", "personal")?.met).toBe(false);
    expect(check("unrelated-words", "personal", { fullName: "Ayesha Khan" })?.met).toBe(true);
    expect(check("khanStreet9", "personal", { fullName: "Ayesha Khan" })?.met).toBe(false);
  });

  it("ignores name parts too short to matter", () => {
    expect(check("aliboard99", "personal", { fullName: "Al B" })?.met).toBe(true);
  });
});

describe("validatePasswordChange", () => {
  const valid = { current: "old-password", next: "a-new-passphrase", confirm: "a-new-passphrase" };

  it("accepts a complete, matching change", () => {
    expect(validatePasswordChange(valid)).toEqual({});
  });

  it("asks for every field", () => {
    expect(Object.keys(validatePasswordChange({ current: "", next: "", confirm: "" }))).toEqual([
      "current",
      "next",
      "confirm",
    ]);
  });

  it("holds the new password to the API's length rule, counted in code points", () => {
    const short = "a".repeat(PASSWORD_MIN_LENGTH - 1);
    expect(validatePasswordChange({ ...valid, next: short, confirm: short }).next).toMatch(/characters/);
    // Seven emoji are fourteen UTF-16 units but seven characters to the API: too short.
    const emoji = "🔒".repeat(PASSWORD_MIN_LENGTH - 1);
    expect(validatePasswordChange({ ...valid, next: emoji, confirm: emoji }).next).toBeDefined();
  });

  it("refuses the current password as the new one", () => {
    const same = { current: "same-password", next: "same-password", confirm: "same-password" };
    expect(validatePasswordChange(same).next).toMatch(/not using now/);
  });

  it("refuses a confirmation that does not match", () => {
    expect(validatePasswordChange({ ...valid, confirm: "a-new-passphrasf" }).confirm).toBe(
      "The passwords do not match",
    );
  });
});

describe("validateNewPassword", () => {
  it("accepts a long enough, matching pair", () => {
    expect(validateNewPassword({ password: "a-new-passphrase", confirm: "a-new-passphrase" })).toEqual({});
  });

  it("asks for both, then for the length rule and a match", () => {
    expect(validateNewPassword({ password: "", confirm: "" })).toEqual({
      password: "Choose a password",
      confirm: "Enter the password again",
    });
    expect(validateNewPassword({ password: "short", confirm: "short" }).password).toMatch(/8 to 128/);
    expect(validateNewPassword({ password: "a-new-passphrase", confirm: "a-new-passphrasf" }).confirm).toBe(
      "The passwords do not match",
    );
  });
});
