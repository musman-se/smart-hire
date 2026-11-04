import { describe, expect, it } from "vitest";

import {
  codePointLength,
  firstInvalid,
  looksLikeEmail,
  validateSignIn,
  visibleErrors,
} from "./validation";

describe("codePointLength", () => {
  it("counts an emoji once, like Python's len()", () => {
    expect("🔑".length).toBe(2);
    expect(codePointLength("🔑")).toBe(1);
    expect(codePointLength("añb")).toBe(3);
  });
});

describe("looksLikeEmail", () => {
  it("accepts ordinary addresses, ignoring surrounding spaces", () => {
    expect(looksLikeEmail("ayesha@example.com")).toBe(true);
    expect(looksLikeEmail("  a.b+tag@sub.example.org ")).toBe(true);
  });

  it("rejects the typos worth catching before a round trip", () => {
    for (const typo of ["", "ayesha", "ayesha@", "ayesha@example", "a yesha@example.com", "@example.com"]) {
      expect(looksLikeEmail(typo), typo).toBe(false);
    }
  });
});

describe("validateSignIn", () => {
  it("asks for both fields when empty", () => {
    expect(validateSignIn({ email: " ", password: "" })).toEqual({
      email: "Enter your email address",
      password: "Enter your password",
    });
  });

  it("checks the email's shape but not the password's length", () => {
    expect(validateSignIn({ email: "nope", password: "x" })).toEqual({
      email: "Enter an email address like name@example.com",
    });
    expect(validateSignIn({ email: "a@b.co", password: "x" })).toEqual({});
  });
});

describe("visibleErrors", () => {
  it("shows only the errors of touched fields", () => {
    const errors = { email: "bad email", password: "missing" };
    expect(visibleErrors(errors, new Set(["password"] as const))).toEqual({ password: "missing" });
    expect(visibleErrors(errors, new Set())).toEqual({});
  });

  it("drops a touched field's error once it is fixed", () => {
    expect(visibleErrors({}, new Set(["email"] as const))).toEqual({});
  });
});

describe("firstInvalid", () => {
  it("follows form order, not the order errors were found in", () => {
    const errors = { password: "x", email: "y" };
    expect(firstInvalid(["email", "password"], errors)).toBe("email");
    expect(firstInvalid(["email", "password"], {})).toBeUndefined();
  });
});
