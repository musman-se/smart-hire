import { describe, expect, it } from "vitest";

import { looksLikePhone } from "./phone";

describe("looksLikePhone", () => {
  it.each(["+92 300 1234567", "(555) 123-4567", "020.7946.0958", "0300-1234567", "  +1 555 0100 ", ""])(
    "accepts %j",
    (value) => {
      expect(looksLikePhone(value)).toBe(true);
    },
  );

  it.each([
    ["letters", "abc"],
    ["letters among digits", "0300 CALL ME"],
    ["a + in the middle", "92+3001234567"],
    ["too few digits", "12-34"],
    ["more digits than any real number", "1234567890123456"],
    ["separators only", "--- ()"],
  ])("refuses %s", (_, value) => {
    expect(looksLikePhone(value)).toBe(false);
  });
});
