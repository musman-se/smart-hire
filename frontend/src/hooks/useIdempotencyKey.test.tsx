import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ApiError } from "../api/client";
import { useIdempotencyKey } from "./useIdempotencyKey";

function setup() {
  const hook = renderHook(({ input }) => useIdempotencyKey(input), { initialProps: { input: "job" } });
  const settleWith = (error: unknown) => {
    act(() => hook.result.current.settle(error));
    hook.rerender({ input: "job" });
  };
  return { hook, settleWith };
}

describe("useIdempotencyKey", () => {
  it("keeps the key while the first attempt is still being processed", () => {
    const { hook, settleWith } = setup();
    const first = hook.result.current.key;

    // A second click while the first request is still running on the server. A fresh
    // key would make the third click create a second job.
    settleWith(new ApiError(409, "idempotency_in_progress", "Still being processed"));
    expect(hook.result.current.key).toBe(first);
  });

  it("keeps the key when there was no answer at all", () => {
    const { hook, settleWith } = setup();
    const first = hook.result.current.key;
    settleWith(new TypeError("Failed to fetch"));
    expect(hook.result.current.key).toBe(first);
    settleWith(new ApiError(502, "unknown_error", "Bad gateway"));
    expect(hook.result.current.key).toBe(first);
  });

  it("starts a new action after an answer — success or a refusal", () => {
    const { hook, settleWith } = setup();
    const first = hook.result.current.key;
    settleWith(new ApiError(409, "job_not_open", "Closed"));
    const second = hook.result.current.key;
    expect(second).not.toBe(first);
    settleWith(null);
    expect(hook.result.current.key).not.toBe(second);
  });
});
