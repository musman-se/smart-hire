import { describe, expect, it } from "vitest";

import { firstName } from "./greeting";

describe("firstName", () => {
  it("is the first word of the full name", () => {
    expect(firstName("  Ayesha   Khan ")).toBe("Ayesha");
    expect(firstName("Cher")).toBe("Cher");
    expect(firstName(undefined)).toBe("");
  });
});
