import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDebouncedUrlText } from "./useDebouncedUrlText";

describe("useDebouncedUrlText", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(initial = "") {
    const commit = vi.fn();
    const hook = renderHook(({ url }) => useDebouncedUrlText(url, commit, 300), {
      initialProps: { url: initial },
    });
    return { commit, ...hook };
  }

  it("updates the box at once but commits once the typing pauses", () => {
    const { result, commit } = setup();
    act(() => result.current[1]("py"));
    act(() => result.current[1]("pyt"));
    expect(result.current[0]).toBe("pyt");
    expect(commit).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(300));
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith("pyt");
  });

  it("does not commit the value it started from", () => {
    const { commit } = setup("go");
    act(() => vi.advanceTimersByTime(1000));
    expect(commit).not.toHaveBeenCalled();
  });

  it("follows a change made outside, such as clearing the filters", () => {
    const { result, rerender, commit } = setup("python");
    rerender({ url: "" });
    expect(result.current[0]).toBe("");
    act(() => vi.advanceTimersByTime(1000));
    expect(commit).not.toHaveBeenCalled();
  });

  it("keeps typing that lands while its own commit reaches the URL", () => {
    const { result, rerender, commit } = setup();
    act(() => result.current[1]("ab"));
    act(() => vi.advanceTimersByTime(300));
    expect(commit).toHaveBeenCalledWith("ab");

    act(() => result.current[1]("abc"));
    rerender({ url: "ab" });
    expect(result.current[0]).toBe("abc");
  });
});
